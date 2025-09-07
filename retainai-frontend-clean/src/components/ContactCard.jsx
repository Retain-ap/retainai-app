// src/components/ContactCard.jsx
import React from "react";

/* RetainAI theme */
const BG = "#181a1b";
const CARD = "#232323";
const BORDER = "#2a2a2a";
const TEXT = "#e9edef";
const SUBTEXT = "#9fb0bb";
const GOLD = "#f7cb53";

function parseDateLike(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(a, b) {
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / 86400000);
}

function warmthLabel(days) {
  if (days == null) return "⚪️ New";
  if (days < 5) return "🟢 Fresh";
  if (days < 10) return "🟡 Warming Up";
  return "🔴 Cold";
}

export default function ContactCard({
  client = {},
  onFollowUp,
  className = "",
}) {
  const {
    name = "(No name)",
    email = "",
    tags = [],
    mood = "",
  } = client;

  // accept multiple backend shapes
  const last =
    client.last_contacted || client.lastContacted || client.createdAt || null;
  const lastDt = parseDateLike(last);
  const days = lastDt ? daysBetween(new Date(), lastDt) : null;

  return (
    <div
      className={`max-w-md rounded-xl shadow-md ${className}`}
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        padding: 16,
      }}
    >
      {/* Header */}
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <h3
          style={{
            color: TEXT,
            fontWeight: 900,
            fontSize: 20,
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {name}
        </h3>
        <span
          title={
            days == null
              ? "No contact yet"
              : `${days} day${days === 1 ? "" : "s"} since last contact`
          }
          style={{ color: SUBTEXT, fontWeight: 800, fontSize: 12 }}
        >
          {warmthLabel(days)}
        </span>
      </div>

      {/* Email */}
      <div style={{ marginTop: 4 }}>
        {email ? (
          <a
            href={`mailto:${email}`}
            style={{
              color: SUBTEXT,
              fontSize: 14,
              textDecoration: "none",
              wordBreak: "break-all",
            }}
          >
            {email}
          </a>
        ) : (
          <span style={{ color: SUBTEXT, fontSize: 14 }}>No email</span>
        )}
      </div>

      {/* Mood */}
      <div style={{ marginTop: 6, color: SUBTEXT, fontSize: 14 }}>
        Mood:{" "}
        <span style={{ color: TEXT, fontWeight: 700 }}>
          {mood || "Unknown"}
        </span>
      </div>

      {/* Tags */}
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {(Array.isArray(tags) ? tags : []).map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            style={{
              background: GOLD,
              color: "#111",
              fontSize: 12,
              fontWeight: 800,
              padding: "4px 8px",
              borderRadius: 999,
            }}
          >
            {tag}
          </span>
        ))}
        {!tags?.length && (
          <span style={{ color: SUBTEXT, fontSize: 12 }}>No tags</span>
        )}
      </div>

      {/* Last contacted */}
      <div style={{ marginTop: 10, color: SUBTEXT, fontSize: 12 }}>
        Last contacted:{" "}
        <span style={{ color: TEXT, fontWeight: 700 }}>
          {lastDt ? lastDt.toLocaleDateString() : "Never"}
        </span>
      </div>

      {/* CTA */}
      <button
        onClick={() => onFollowUp && onFollowUp(client)}
        disabled={!onFollowUp}
        style={{
          marginTop: 14,
          width: "100%",
          background: GOLD,
          color: "#111",
          fontWeight: 900,
          border: "none",
          borderRadius: 12,
          padding: "10px 14px",
          cursor: onFollowUp ? "pointer" : "not-allowed",
          boxShadow: "0 2px 10px rgba(0,0,0,.25)",
        }}
        aria-label="Suggest follow-up"
        title={onFollowUp ? "Suggest follow-up" : "No handler provided"}
      >
        ✉️ Suggest Follow-Up
      </button>
    </div>
  );
}
