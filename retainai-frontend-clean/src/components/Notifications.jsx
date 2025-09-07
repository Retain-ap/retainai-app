// src/components/Notifications.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

/** ---------- API BASE (CRA + Vite safe) ---------- */
const API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_BASE) ||
  (typeof window !== "undefined" &&
  window.location &&
  window.location.hostname.includes("localhost")
    ? "http://localhost:5000"
    : "https://retainai-app.onrender.com");

/** ---------- THEME ---------- */
const UI = {
  CARD_BG_UNREAD: "#232323",
  CARD_BG_READ: "#181818",
  BORDER_UNREAD: "#f7cb53",
  BORDER_READ: "#444",
  SHADOW: "0 0 14px #f7cb5333",
  GOLD: "#f7cb53",
  TEXT: "#fff",
  SUB: "#aaa",
  BG: "#0B0C0E",
};

/** ---------- ICONS ---------- */
const NOTIF_ICONS = {
  reminder: "🔔",
  appointment: "📅",
  ai: "🤖",
  info: "ℹ️",
  cold: "❗",
};

/** ---------- HELPERS ---------- */
function safeDate(ts) {
  const t = Date.parse(ts);
  return Number.isFinite(t) ? new Date(t) : new Date(0);
}
function formatTimeAgo(ts, now = Date.now()) {
  const d = safeDate(ts).getTime();
  if (!Number.isFinite(d) || d <= 0) return "";
  const diff = Math.max(0, Math.floor((now - d) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(d).toLocaleString();
}

/** ---------- CARD ---------- */
function NotificationCard({ notif, onMarkRead, onOpenLead }) {
  const isRead = !!notif.read;
  const icon = NOTIF_ICONS[notif.type] || "🔔";

  return (
    <div
      style={{
        background: isRead ? UI.CARD_BG_READ : UI.CARD_BG_UNREAD,
        border: isRead ? `1.5px solid ${UI.BORDER_READ}` : `2.5px solid ${UI.BORDER_UNREAD}`,
        borderRadius: 14,
        marginBottom: 17,
        boxShadow: isRead ? "" : UI.SHADOW,
        padding: "18px 24px",
        display: "flex",
        alignItems: "center",
        gap: 17,
        opacity: isRead ? 0.6 : 1,
        transition: "opacity 0.16s, border 0.2s",
      }}
      aria-live="polite"
    >
      <span style={{ fontSize: 25, marginRight: 9 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: UI.GOLD, fontWeight: 700, marginBottom: 3, wordBreak: "break-word" }}>
          {notif.title || "Notification"}
        </div>
        {notif.message && (
          <div style={{ color: UI.TEXT, fontSize: 14, marginTop: 2, whiteSpace: "pre-wrap" }}>
            {notif.message}
          </div>
        )}
        {notif.leadName && (
          <div style={{ color: "#b6e355", marginTop: 4 }}>Lead: {notif.leadName}</div>
        )}
        <div style={{ fontSize: 13, color: UI.SUB, marginTop: 6 }}>
          {formatTimeAgo(notif.timestamp)}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {notif.leadId && (
          <button
            style={{
              background: UI.GOLD,
              color: "#232323",
              fontWeight: 700,
              border: "none",
              borderRadius: 7,
              padding: "6px 15px",
              cursor: "pointer",
              marginBottom: 3,
            }}
            onClick={() => onOpenLead?.(notif.leadId)}
          >
            Open Lead
          </button>
        )}
        {!isRead && (
          <button
            style={{
              background: "#191919",
              color: UI.GOLD,
              border: `1px solid ${UI.GOLD}`,
              borderRadius: 7,
              padding: "6px 15px",
              fontWeight: 700,
              cursor: "pointer",
            }}
            onClick={() => onMarkRead?.(notif.id)}
          >
            Mark as Read
          </button>
        )}
      </div>
    </div>
  );
}

/** ---------- MAIN ---------- */
export default function Notifications({ user, leads = [], setSection, afterSend }) {
  const userEmail = user?.email || "";
  const [notifs, setNotifs] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [nowTick, setNowTick] = useState(Date.now()); // re-renders for time-ago

  const pollRef = useRef(null);
  const sseRef = useRef(null);

  // keep “time ago” fresh
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const sortAndDedup = useCallback((items = []) => {
    // normalize + dedupe by id (fallback to ts+title)
    const seen = new Set();
    const rows = [];
    for (const n of items) {
      if (!n) continue;
      const key = n.id || `${n.timestamp || ""}|${n.title || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id: n.id || key,
        type: (n.type || "info").toLowerCase(),
        title: n.title || "Notification",
        message: n.message || "",
        timestamp: n.timestamp || n.createdAt || new Date().toISOString(),
        read: !!n.read,
        leadId: n.leadId || n.lead_id || null,
        leadName: n.leadName || n.lead_name || null,
      });
    }
    rows.sort((a, b) => safeDate(b.timestamp) - safeDate(a.timestamp));
    return rows;
  }, []);

  const load = useCallback(async (signal) => {
    if (!userEmail) return;
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/notifications/${encodeURIComponent(userEmail)}`, { signal });
      const data = await res.json().catch(() => ({}));
      const rows = sortAndDedup(data.notifications || data || []);
      setNotifs(rows);
    } catch (e) {
      if (e.name !== "AbortError") setErr("Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [userEmail, sortAndDedup]);

  // SSE (best-effort) -> fallback to polling
  useEffect(() => {
    if (!userEmail) return;

    // initial load (with abort)
    const ac = new AbortController();
    load(ac.signal);

    // try SSE
    if ("EventSource" in window) {
      const url = `${API_BASE}/api/notifications/stream?user_email=${encodeURIComponent(userEmail)}`;
      const es = new EventSource(url, { withCredentials: false });
      sseRef.current = es;

      es.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          if (!payload) return;
          setNotifs((prev) => {
            const merged = sortAndDedup([...(prev || []), ...(payload.notifications || [payload])]);
            return merged;
          });
        } catch {}
      };
      es.onerror = () => {
        // close and fall back to polling
        try { es.close(); } catch {}
        sseRef.current = null;
        startPolling();
      };
      // also start a slow safety poll in case SSE stalls silently
      startPolling(60_000);
    } else {
      startPolling();
    }

    function startPolling(interval = 20_000) {
      stopPolling();
      pollRef.current = setInterval(() => load(), interval);
    }
    function stopPolling() {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    return () => {
      ac.abort();
      stopPolling();
      if (sseRef.current) {
        try { sseRef.current.close(); } catch {}
        sseRef.current = null;
      }
    };
  }, [userEmail, load]);

  // actions
  const markAsRead = useCallback(async (id) => {
    if (!id || !userEmail) return;
    // optimistic
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await fetch(`${API_BASE}/api/notifications/${encodeURIComponent(userEmail)}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      // revert on error
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: false } : n)));
    }
  }, [userEmail]);

  const markAllRead = useCallback(async () => {
    if (!userEmail) return;
    const unreadIds = notifs.filter((n) => !n.read).map((n) => n.id);
    if (!unreadIds.length) return;
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch(`${API_BASE}/api/notifications/${encodeURIComponent(userEmail)}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unreadIds }),
      });
    } catch {
      // soft failure; next refresh will correct
    }
  }, [userEmail, notifs]);

  const openLead = useCallback((id) => {
    if (!id) return;
    setSection?.("dashboard");
    afterSend?.(id); // your app uses this to focus/highlight the lead
  }, [setSection, afterSend]);

  // derived
  const counts = useMemo(() => {
    const all = notifs.length;
    const byType = notifs.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1;
      return acc;
    }, {});
    const unread = notifs.filter((n) => !n.read).length;
    return { all, unread, byType };
  }, [notifs]);

  const filtered = useMemo(() => {
    const base = filter === "all" ? notifs : notifs.filter((n) => n.type === filter);
    return base;
  }, [notifs, filter]);

  return (
    <div style={{ padding: 40, color: UI.GOLD, minHeight: "100vh", background: UI.BG }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontWeight: 800, fontSize: "2em", margin: 0 }}>Notifications Center</h2>
        <span
          title="Unread"
          style={{
            background: UI.GOLD,
            color: "#191919",
            borderRadius: 999,
            fontWeight: 900,
            padding: "2px 10px",
            fontSize: 12,
          }}
        >
          {counts.unread} new
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => load()}
            style={btn("ghost")}
            title="Refresh"
            aria-label="Refresh notifications"
          >
            Refresh
          </button>
          <button
            onClick={markAllRead}
            style={btn("outline")}
            disabled={!counts.unread}
            aria-disabled={!counts.unread}
            title="Mark all as read"
          >
            Mark All Read
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ margin: "8px 0 18px 0", display: "flex", gap: 9, flexWrap: "wrap" }}>
        <FilterBtn label={`All (${counts.all})`} active={filter === "all"} onClick={() => setFilter("all")} />
        {Object.keys(NOTIF_ICONS).map((t) => (
          <FilterBtn
            key={t}
            label={`${t[0].toUpperCase()}${t.slice(1)} (${counts.byType[t] || 0})`}
            active={filter === t}
            onClick={() => setFilter(t)}
          />
        ))}
      </div>

      {/* Body */}
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {err && (
          <div style={{ background: "#3a2a18", color: "#ffdca2", border: `1px solid ${UI.GOLD}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
            {err}
          </div>
        )}

        {loading && notifs.length === 0 ? (
          <SkeletonList />
        ) : filtered.length === 0 ? (
          <div style={{ color: UI.TEXT, background: UI.CARD_BG_UNREAD, borderRadius: 10, padding: 18, border: `1px solid ${UI.BORDER_READ}` }}>
            No notifications.
          </div>
        ) : (
          filtered.map((n) => (
            <NotificationCard
              key={n.id}
              notif={n}
              onMarkRead={markAsRead}
              onOpenLead={openLead}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** ---------- Small UI atoms ---------- */
function FilterBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? UI.GOLD : "#191919",
        color: active ? "#191919" : UI.GOLD,
        border: `1px solid ${UI.GOLD}`,
        borderRadius: 7,
        padding: "6px 18px",
        fontWeight: 700,
        cursor: "pointer",
      }}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}
function SkeletonList() {
  return (
    <div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          style={{
            background: UI.CARD_BG_UNREAD,
            border: `1px solid ${UI.BORDER_READ}`,
            borderRadius: 14,
            marginBottom: 17,
            padding: "18px 24px",
            display: "flex",
            gap: 17,
            alignItems: "center",
          }}
        >
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#2a2a2a" }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 14, width: "40%", background: "#2a2a2a", borderRadius: 6 }} />
            <div style={{ height: 10, width: "70%", background: "#262626", borderRadius: 6, marginTop: 10 }} />
          </div>
          <div style={{ width: 100, height: 28, background: "#222", borderRadius: 8 }} />
        </div>
      ))}
    </div>
  );
}
function btn(kind) {
  const base = {
    borderRadius: 8,
    padding: "8px 14px",
    fontWeight: 800,
    cursor: "pointer",
    border: 0,
  };
  if (kind === "outline") {
    return { ...base, background: "transparent", color: UI.GOLD, border: `2px solid ${UI.GOLD}` };
  }
  // ghost
  return { ...base, background: "#191919", color: UI.GOLD, border: `1px solid ${UI.GOLD}` };
}
