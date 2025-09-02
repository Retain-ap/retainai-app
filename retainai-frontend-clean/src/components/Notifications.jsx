// src/components/Notifications.jsx

import React, { useEffect, useState } from "react";

function formatTimeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleString();
}

const NOTIF_ICONS = {
  reminder: "🔔",
  appointment: "📅",
  ai: "🤖",
  info: "ℹ️",
  cold: "❗",
};

function NotificationCard({ notif, onMarkRead, onOpenLead }) {
  return (
    <div
      style={{
        background: notif.read ? "#181818" : "#232323",
        border: notif.read ? "1.5px solid #444" : "2.5px solid #f7cb53",
        borderRadius: 14,
        marginBottom: 17,
        boxShadow: notif.read ? "" : "0 0 14px #f7cb5333",
        padding: "18px 24px",
        display: "flex",
        alignItems: "center",
        gap: 17,
        opacity: notif.read ? 0.6 : 1,
        transition: "opacity 0.16s, border 0.2s",
      }}
    >
      <span style={{ fontSize: 25, marginRight: 9 }}>
        {NOTIF_ICONS[notif.type] || "🔔"}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ color: "#f7cb53", fontWeight: 700, marginBottom: 3 }}>
          {notif.title}
        </div>
        {notif.leadName && (
          <div style={{ color: "#b6e355" }}>Lead: {notif.leadName}</div>
        )}
        <div style={{ fontSize: 13, color: "#aaa", marginTop: 2 }}>
          {formatTimeAgo(notif.timestamp)}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {notif.leadId && (
          <button
            style={{
              background: "#f7cb53",
              color: "#232323",
              fontWeight: 700,
              border: "none",
              borderRadius: 7,
              padding: "6px 15px",
              cursor: "pointer",
              marginBottom: 3,
            }}
            onClick={() => onOpenLead(notif.leadId)}
          >
            Open Lead
          </button>
        )}
        {!notif.read && (
          <button
            style={{
              background: "#191919",
              color: "#f7cb53",
              border: "1px solid #f7cb53",
              borderRadius: 7,
              padding: "6px 15px",
              fontWeight: 700,
              cursor: "pointer",
            }}
            onClick={() => onMarkRead(notif.id)}
          >
            Mark as Read
          </button>
        )}
      </div>
    </div>
  );
}

export default function Notifications({ user, leads = [], setSection, afterSend }) {
  const [notifs, setNotifs] = useState([]);
  const [filter, setFilter] = useState("all");
  const userEmail = user?.email;

  useEffect(() => {
    if (userEmail) {
      fetch(`/api/notifications/${encodeURIComponent(userEmail)}`)
        .then((r) => r.json())
        .then((data) => setNotifs(data.notifications || []));
    }
  }, [userEmail]);

  function markAsRead(id) {
    fetch(`/api/notifications/${encodeURIComponent(userEmail)}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
      .then((r) => r.json())
      .then(() => setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n)));
  }

  function openLead(id) {
    setSection && setSection("dashboard");
    // Optionally: highlight that lead, etc.
    afterSend && afterSend(id);
  }

  const filteredNotifs =
    filter === "all"
      ? notifs
      : notifs.filter((n) => n.type === filter);

  return (
    <div style={{ padding: 40, color: "#f7cb53", minHeight: "100vh" }}>
      <h2 style={{ fontWeight: 800, fontSize: "2em" }}>Notifications Center</h2>
      <div style={{ margin: "16px 0 24px 0" }}>
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
          style={{
            background: filter === "all" ? "#f7cb53" : "#191919",
            color: filter === "all" ? "#191919" : "#f7cb53",
            border: "1px solid #f7cb53",
            borderRadius: 7,
            padding: "6px 18px",
            fontWeight: 700,
            marginRight: 9,
            cursor: "pointer"
          }}
        >
          All
        </button>
        <button
          className={filter === "reminder" ? "active" : ""}
          onClick={() => setFilter("reminder")}
          style={{
            background: filter === "reminder" ? "#f7cb53" : "#191919",
            color: filter === "reminder" ? "#191919" : "#f7cb53",
            border: "1px solid #f7cb53",
            borderRadius: 7,
            padding: "6px 18px",
            fontWeight: 700,
            marginRight: 9,
            cursor: "pointer"
          }}
        >
          Reminders
        </button>
        <button
          className={filter === "ai" ? "active" : ""}
          onClick={() => setFilter("ai")}
          style={{
            background: filter === "ai" ? "#f7cb53" : "#191919",
            color: filter === "ai" ? "#191919" : "#f7cb53",
            border: "1px solid #f7cb53",
            borderRadius: 7,
            padding: "6px 18px",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          AI
        </button>
        {/* Add more filter buttons as needed */}
      </div>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        {filteredNotifs.length === 0 ? (
          <div style={{ color: "#fff", background: "#232323", borderRadius: 10, padding: 18 }}>
            No notifications.
          </div>
        ) : (
          filteredNotifs.map((notif) => (
            <NotificationCard
              key={notif.id}
              notif={notif}
              onMarkRead={markAsRead}
              onOpenLead={openLead}
            />
          ))
        )}
      </div>
    </div>
  );
}
