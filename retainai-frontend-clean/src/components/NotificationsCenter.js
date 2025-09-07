// src/components/NotificationsCenter.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./NotificationsCenter.css";

// small event helper (same pattern we used elsewhere)
const ping = (name) => window.dispatchEvent(new Event(name));

/** ---------- API BASE (CRA + Vite safe) ---------- */
const API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_BASE) ||
  // Fallback: prod host unless localhost
  (typeof window !== "undefined" &&
  window.location &&
  window.location.hostname.includes("localhost")
    ? "http://localhost:5000"
    : "https://retainai-app.onrender.com");

function safeDate(v) {
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : new Date(0);
}

export default function NotificationsCenter({ user }) {
  const userEmail = user?.email || "";
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | unread | read
  const [error, setError] = useState("");

  const pollRef = useRef(null);
  const sseRef = useRef(null);

  const normalize = useCallback((rows = []) => {
    // dedupe by id (fallback to timestamp+subject)
    const out = [];
    const seen = new Set();
    rows.forEach((n, idx) => {
      if (!n) return;
      const id =
        n.id ??
        n._id ??
        n.uuid ??
        `${n.timestamp || ""}|${n.subject || ""}|${idx}`;
      if (seen.has(id)) return;
      seen.add(id);
      out.push({
        ...n,
        read: n.read ?? false,
        _id: String(id),
        subject: n.subject || "—",
        message: n.message || "",
        timestamp: n.timestamp || n.createdAt || new Date().toISOString(),
        lead_email: n.lead_email || n.leadEmail || "",
      });
    });
    // newest first
    out.sort((a, b) => safeDate(b.timestamp) - safeDate(a.timestamp));
    return out;
  }, []);

  const load = useCallback(
    async (signal) => {
      if (!userEmail) return;
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `${API_BASE}/api/notifications/${encodeURIComponent(userEmail)}`,
          { signal }
        );
        const data = await res.json().catch(() => ({}));
        const rows = Array.isArray(data?.notifications)
          ? data.notifications
          : Array.isArray(data)
          ? data
          : [];
        setNotifications(normalize(rows));
      } catch (e) {
        if (e.name !== "AbortError") {
          setNotifications([]);
          setError("Failed to load notifications.");
        }
      } finally {
        setLoading(false);
      }
    },
    [userEmail, normalize]
  );

  // initial load + listen to external refresh pings
  useEffect(() => {
    if (!userEmail) return;
    const ac = new AbortController();
    load(ac.signal);

    const onChanged = () => load();
    window.addEventListener("notifications:changed", onChanged);
    return () => {
      ac.abort();
      window.removeEventListener("notifications:changed", onChanged);
    };
  }, [load, userEmail]);

  // Live updates: SSE (best-effort) -> polling fallback
  useEffect(() => {
    if (!userEmail) return;

    const startPolling = (interval = 20_000) => {
      stopPolling();
      pollRef.current = setInterval(() => load(), interval);
    };
    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    // try SSE
    if ("EventSource" in window) {
      const url = `${API_BASE}/api/notifications/stream?user_email=${encodeURIComponent(
        userEmail
      )}`;
      const es = new EventSource(url, { withCredentials: false });
      sseRef.current = es;

      es.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          const rows = Array.isArray(payload?.notifications)
            ? payload.notifications
            : [payload];
          setNotifications((prev) => normalize([...(prev || []), ...rows]));
        } catch {
          // ignore malformed packet; polling will keep us consistent
        }
      };
      es.onerror = () => {
        try {
          es.close();
        } catch {}
        sseRef.current = null;
        startPolling(); // fallback
      };

      // safety slow poll in case the SSE stalls silently
      startPolling(60_000);
    } else {
      startPolling();
    }

    return () => {
      if (sseRef.current) {
        try {
          sseRef.current.close();
        } catch {}
        sseRef.current = null;
      }
      stopPolling();
    };
  }, [userEmail, load, normalize]);

  const markAsRead = useCallback(
    async (notif) => {
      if (!notif?._id || !userEmail) return;
      // optimistic UI
      setNotifications((ns) =>
        ns.map((n) => (n._id === notif._id ? { ...n, read: true } : n))
      );
      const idParam = notif.id ?? notif._id ?? notif.uuid ?? notif._idx ?? notif._id;
      try {
        // primary endpoint
        const res = await fetch(
          `${API_BASE}/api/notifications/${encodeURIComponent(
            userEmail
          )}/${encodeURIComponent(idParam)}/mark_read`,
          { method: "POST" }
        );
        if (!res.ok) throw new Error();
      } catch {
        try {
          // fallback bulk endpoint with single id
          await fetch(
            `${API_BASE}/api/notifications/${encodeURIComponent(userEmail)}/read`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: [idParam] }),
            }
          );
        } catch {
          // leave optimistic state; next refresh will reconcile
        }
      }
      ping("notifications:changed");
    },
    [userEmail]
  );

  const markAllRead = useCallback(async () => {
    if (!userEmail) return;
    const ids = notifications.filter((n) => !n.read).map((n) => n.id ?? n._id);
    if (!ids.length) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch(
        `${API_BASE}/api/notifications/${encodeURIComponent(userEmail)}/read`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        }
      );
    } catch {
      // soft-fail; UI stays optimistic
    }
    ping("notifications:changed");
  }, [notifications, userEmail]);

  const visible = useMemo(() => {
    const list =
      filter === "all"
        ? notifications
        : notifications.filter((n) => (filter === "unread" ? !n.read : n.read));
    // already sorted by normalize; keep as-is
    return list;
  }, [notifications, filter]);

  if (!userEmail) {
    return (
      <div className="notif-root">
        <div className="notif-header">
          <h2 className="notif-title">Notifications</h2>
          <p className="notif-subtitle">Please log in to view notifications.</p>
        </div>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="notif-root">
      <div className="notif-header">
        <div className="notif-title-row">
          <h2 className="notif-title">Notifications</h2>
          {unreadCount > 0 && (
            <span className="notif-badge" title="Unread">
              {unreadCount}
            </span>
          )}
        </div>
        <p className="notif-subtitle">
          See all alerts, reminders, and automated messages sent by RetainAI.
        </p>

        <div className="notif-filters">
          {["all", "unread", "read"].map((f) => (
            <button
              key={f}
              className={`notif-filter-btn ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="notif-filter-btn" onClick={() => load()}>
              Refresh
            </button>
            <button
              className="notif-filter-btn"
              onClick={markAllRead}
              disabled={!unreadCount}
              aria-disabled={!unreadCount}
              title="Mark all as read"
            >
              Mark All Read
            </button>
          </div>
        </div>
      </div>

      {error && <div className="notif-empty">{error}</div>}

      {loading ? (
        <div className="notif-empty">Loading notifications…</div>
      ) : visible.length === 0 ? (
        <div className="notif-empty">No notifications found.</div>
      ) : (
        <ul className="notif-list">
          {visible.map((notif) => {
            const isReminder = String(notif.subject || "")
              .toLowerCase()
              .includes("reminder");
            const icon = isReminder
              ? "🔔"
              : String(notif.subject || "")
                  .toLowerCase()
                  .includes("appointment")
              ? "📅"
              : "📧";
            return (
              <li
                key={notif._id}
                className={`notif-item ${notif.read ? "read" : "unread"}`}
              >
                <div className="notif-icon" aria-hidden>
                  {icon}
                </div>

                <div className="notif-body">
                  <div className="notif-subject">{notif.subject || "—"}</div>
                  {notif.message && (
                    <div className="notif-message">{notif.message}</div>
                  )}
                  <div className="notif-meta">
                    {notif.lead_email && (
                      <span className="notif-lead">
                        Lead: <b>{notif.lead_email}</b>
                      </span>
                    )}
                    <span className="notif-time">
                      {notif.timestamp
                        ? new Date(notif.timestamp).toLocaleString()
                        : ""}
                    </span>
                  </div>
                </div>

                {!notif.read && (
                  <button
                    className="notif-mark-read"
                    onClick={() => markAsRead(notif)}
                  >
                    Mark as Read
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
