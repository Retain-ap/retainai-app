// src/components/LeadCard.jsx
import React, { useMemo } from "react";
import "./LeadCard.css";

/**
 * LeadCard
 * - Accessible (keyboard + ARIA)
 * - Smart status fallback from last_contacted
 * - Duplicate-safe tag rendering
 * - Truncated notes with sensible default
 * - Subtle avatar color derived from lead identity
 */
export default function LeadCard({ lead = {}, onClick, onContacted }) {
  const {
    name = "",
    email = "",
    notes = "",
    tags = [],
    status: rawStatus,
    status_color,
    last_contacted,
    lastContacted, // legacy
  } = lead;

  const initials = useMemo(() => {
    const src = (name || email || "?").trim();
    const parts = src.split(/\s+/).filter(Boolean);
    const two =
      parts.length >= 2
        ? (parts[0][0] || "") + (parts[1][0] || "")
        : (src[0] || "") + (src[1] || "");
    return two.toUpperCase() || "?";
  }, [name, email]);

  const daysSince = useMemo(() => {
    const iso = last_contacted || lastContacted;
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return null;
    const days = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  }, [last_contacted, lastContacted]);

  const derivedStatus = useMemo(() => {
    if (rawStatus) return rawStatus; // trust upstream if provided
    if (daysSince == null) return "active";
    if (daysSince >= 14) return "cold";
    if (daysSince >= 7) return "warning";
    return "active";
  }, [rawStatus, daysSince]);

  const statusColor = useMemo(() => {
    if (status_color) return status_color;
    switch (derivedStatus) {
      case "cold":
        return "#ff6565";
      case "warning":
        return "#ffd966";
      default:
        return "#30b46c";
    }
  }, [status_color, derivedStatus]);

  const statusLabel = useMemo(() => {
    switch (derivedStatus) {
      case "cold":
        return "Overdue";
      case "warning":
        return "Follow Up";
      default:
        return "Active";
    }
  }, [derivedStatus]);

  const statusTitle = useMemo(() => {
    switch (derivedStatus) {
      case "cold":
        return "Overdue for follow-up";
      case "warning":
        return "Time to follow up";
      default:
        return "Active and up to date";
    }
  }, [derivedStatus]);

  const uniqueTags = useMemo(() => {
    const seen = new Set();
    return (tags || [])
      .filter(Boolean)
      .map((t) => String(t).trim())
      .filter((t) => t && !seen.has(t) && seen.add(t))
      .slice(0, 6); // keep UI tight
  }, [tags]);

  const truncatedNotes = useMemo(() => {
    const s = String(notes || "").trim();
    if (!s) return "No notes yet";
    return s.length > 120 ? s.slice(0, 120) + "…" : s;
  }, [notes]);

  // Simple deterministic hue from email/name for avatar
  const avatarHue = useMemo(() => {
    const base = (name || email || "?")
      .split("")
      .reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return base % 360;
  }, [name, email]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(e);
    }
  };

  return (
    <div
      className={`lead-card folk-style lead-card--${derivedStatus}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`Lead ${name || email}${derivedStatus ? `, ${statusLabel}` : ""}`}
      style={{
        outline: "none",
      }}
    >
      <div
        className="lead-avatar"
        aria-hidden
        style={{
          background: `linear-gradient(135deg, hsl(${avatarHue} 60% 52%), hsl(${(avatarHue + 35) % 360} 60% 42%))`,
          color: "#111",
          fontWeight: 900,
        }}
      >
        {initials}
      </div>

      <div className="lead-info">
        <div className="lead-name-row">
          <span className="lead-name">{name || email || "Unknown Lead"}</span>

          <span
            className="lead-status"
            style={{
              background: statusColor,
              color: "#232323",
              marginLeft: 7,
              textTransform: "capitalize",
              fontWeight: 900,
            }}
            title={statusTitle}
          >
            {statusLabel}
          </span>

          {(derivedStatus === "cold" || derivedStatus === "warning") && (
            <button
              className="contacted-btn"
              style={{ marginLeft: 9 }}
              onClick={(e) => {
                e.stopPropagation();
                onContacted?.(lead);
              }}
              title="Mark as contacted now"
            >
              Lead Contacted
            </button>
          )}
        </div>

        {/* Secondary line with email + recency */}
        <div className="lead-submeta" style={{ marginTop: 2, color: "#9fb0bb", fontWeight: 700, fontSize: 12 }}>
          {email && <span>{email}</span>}
          {email && daysSince != null && <span style={{ padding: "0 6px" }}>•</span>}
          {daysSince != null && (
            <span title={new Date(last_contacted || lastContacted).toLocaleString()}>
              {daysSince === 0 ? "Contacted today" : `Last contacted ${daysSince}d ago`}
            </span>
          )}
        </div>

        {/* Tags */}
        {uniqueTags.length > 0 && (
          <div className="lead-meta" style={{ marginTop: 6 }}>
            {uniqueTags.map((tag) => (
              <span key={tag} className="lead-tag">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Notes */}
        <div className="lead-notes" style={{ color: "#9aa3ab", marginTop: 6 }}>
          {truncatedNotes}
        </div>
      </div>
    </div>
  );
}
