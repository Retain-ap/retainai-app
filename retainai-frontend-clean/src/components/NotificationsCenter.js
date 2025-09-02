// src/components/NotificationsCenter.jsx
import React, { useEffect, useMemo, useState } from "react";
import "./NotificationsCenter.css";

// small event helper (same pattern we used elsewhere)
const ping = (name) => window.dispatchEvent(new Event(name));

export default function NotificationsCenter({ user }) {
  const API = process.env.REACT_APP_API_URL;

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | unread | read

  const load = async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API || ""}/api/notifications/${encodeURIComponent(user.email)}`
      );
      const data = await res.json().catch(() => ({}));
      const rows = Array.isArray(data?.notifications)
        ? data.notifications
        : [];
      // normalize + stable local id
      setNotifications(
        rows.map((n, idx) => ({
          ...n,
          read: n.read ?? false,
          _id: String(n.id ?? n._id ?? n.uuid ?? idx),
          _idx: idx,
        }))
      );
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // optional: allow other widgets to ask us to refresh
    const onChanged = () => load();
    window.addEventListener("notifications:changed", onChanged);
    return () => window.removeEventListener("notifications:changed", onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API, user?.email]);

  const markAsRead = async (notif) => {
    // optimistic UI
    setNotifications((ns) =>
      ns.map((n) => (n._id === notif._id ? { ...n, read: true } : n))
    );

    // best-effort persist (prefer id; fallback to index)
    const idParam = notif.id ?? notif._id ?? notif.uuid ?? notif._idx;
    try {
      await fetch(
        `${API || ""}/api/notifications/${encodeURIComponent(
          user.email
        )}/${encodeURIComponent(idParam)}/mark_read`,
        { method: "POST" }
      );
    } catch {
      // ignore network errors; leave optimistic state
    }
    ping("notifications:changed");
  };

  const visible = useMemo(() => {
    const list =
      filter === "all"
        ? notifications
        : notifications.filter((n) => (filter === "unread" ? !n.read : n.read));
    return list.sort(
      (a, b) =>
        new Date(b.timestamp || 0).getTime() -
        new Date(a.timestamp || 0).getTime()
    );
  }, [notifications, filter]);

  if (!user?.email) {
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
        </div>
      </div>

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
              : String(notif.subject || "").toLowerCase().includes("appointment")
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
