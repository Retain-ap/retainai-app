// src/components/EditLeadModal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * EditLeadModal
 * - Dark theme to match the rest of the app (RetainAI black/white/gold)
 * - Safely handles both `last_contacted` and `lastContacted`
 * - Tags editor with suggestions (optional via `allTags` prop)
 * - Returns a normalized lead object to `onSave`
 *
 * Props:
 *   lead:        Lead object to edit (required)
 *   onClose:     () => void
 *   onSave:      (updatedLead) => void
 *   allTags?:    string[]  (optional list of tag suggestions)
 */
export default function EditLeadModal({ lead, onClose, onSave, allTags = [] }) {
  if (!lead) return null;

  // ---- THEME TOKENS (aligned with other components) ----
  const BG = "#181a1b";
  const CARD = "#232323";
  const BORDER = "#2a3942";
  const TEXT = "#e9edef";
  const SUBTEXT = "#9fb0bb";
  const GOLD = "#f7cb53";

  // ---- Helpers ----
  const toDateParts = (isoLike) => {
    if (!isoLike) return { date: "", time: "" };
    const d = new Date(isoLike);
    if (isNaN(d)) return { date: "", time: "" };
    const date = d.toISOString().slice(0, 10);
    const time = d.toISOString().slice(11, 16);
    return { date, time };
  };

  const initialLast =
    lead.last_contacted || lead.lastContacted || lead.createdAt || "";

  const { date: initialDate, time: initialTime } = toDateParts(initialLast);

  const parseTags = (t) =>
    Array.isArray(t)
      ? t
      : typeof t === "string"
      ? t
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  // ---- Local form state ----
  const [name, setName] = useState(lead.name || "");
  const [email, setEmail] = useState(lead.email || "");
  const [phone, setPhone] = useState(lead.phone || lead.phoneNumber || "");
  const [notes, setNotes] = useState(lead.notes || "");
  const [lastDate, setLastDate] = useState(initialDate);
  const [lastTime, setLastTime] = useState(initialTime);
  const [tags, setTags] = useState(parseTags(lead.tags));

  const emailRef = useRef(null);

  useEffect(() => {
    // Sync form when lead changes
    setName(lead.name || "");
    setEmail(lead.email || "");
    setPhone(lead.phone || lead.phoneNumber || "");
    setNotes(lead.notes || "");
    const last =
      lead.last_contacted || lead.lastContacted || lead.createdAt || "";
    const { date, time } = toDateParts(last);
    setLastDate(date);
    setLastTime(time);
    setTags(parseTags(lead.tags));
  }, [lead]);

  // Tag suggestions (exclude already selected)
  const tagSuggestions = useMemo(() => {
    const selected = new Set(tags.map((t) => t.toLowerCase()));
    return (allTags || []).filter(
      (t) => t && !selected.has(String(t).toLowerCase())
    );
  }, [allTags, tags]);

  // ---- Events ----
  const addTag = (t) => {
    const v = String(t || "").trim();
    if (!v) return;
    if (!tags.find((x) => x.toLowerCase() === v.toLowerCase())) {
      setTags([...tags, v]);
    }
  };
  const removeTag = (t) => {
    setTags(tags.filter((x) => x !== t));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Basic email check if present
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailRef.current?.focus();
      return;
    }

    // Build ISO "last_contacted"
    const iso =
      lastDate && (lastTime || lastTime === "")
        ? `${lastDate}T${lastTime || "00:00"}:00`
        : "";

    const updated = {
      ...lead,
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      notes: notes.trim(),
      tags: [...tags],
      // keep both for compatibility across the app
      last_contacted: iso || lead.last_contacted || lead.lastContacted || "",
      lastContacted: iso || lead.last_contacted || lead.lastContacted || "",
    };

    onSave?.(updated);
    onClose?.();
  };

  const onBackdrop = (e) => {
    // close if clicked outside the card
    if (e.target === e.currentTarget) onClose?.();
  };

  // ---- Styles ----
  const label = { color: SUBTEXT, fontWeight: 800, fontSize: 12, marginBottom: 6 };
  const input = {
    width: "100%",
    background: BG,
    color: TEXT,
    border: `1.5px solid ${BORDER}`,
    borderRadius: 10,
    padding: "10px 12px",
    fontWeight: 700,
    outline: "none",
  };

  return (
    <div
      onClick={onBackdrop}
      style={{
        position: "fixed",
        inset: 0,
        background: "#000a",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 18,
          padding: 22,
          color: TEXT,
          boxShadow: "0 2px 28px rgba(0,0,0,0.45)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <div style={{ color: GOLD, fontWeight: 900, fontSize: 18 }}>
            Edit Lead
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              color: TEXT,
              border: `1.3px solid ${BORDER}`,
              borderRadius: 8,
              padding: "8px 12px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div style={label}>Name</div>
              <input
                style={input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
              />
            </div>

            <div>
              <div style={label}>Email</div>
              <input
                ref={emailRef}
                style={input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                type="email"
              />
            </div>

            <div>
              <div style={label}>Phone</div>
              <input
                style={input}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={label}>Last contacted — date</div>
                <input
                  style={input}
                  type="date"
                  value={lastDate}
                  onChange={(e) => setLastDate(e.target.value)}
                />
              </div>
              <div>
                <div style={label}>Last contacted — time</div>
                <input
                  style={input}
                  type="time"
                  value={lastTime}
                  onChange={(e) => setLastTime(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div style={label}>Notes</div>
              <textarea
                rows={4}
                style={{ ...input, resize: "vertical" }}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes about this lead…"
              />
            </div>

            {/* Tags */}
            <div>
              <div style={label}>Tags</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {tags.map((t) => (
                  <span
                    key={t}
                    style={{
                      background: GOLD,
                      color: "#111",
                      fontWeight: 800,
                      padding: "6px 10px",
                      borderRadius: 999,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      title="Remove tag"
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        fontWeight: 900,
                        color: "#111",
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {!tags.length && (
                  <span style={{ color: SUBTEXT, fontWeight: 700 }}>No tags</span>
                )}
              </div>

              {/* Quick add via comma input */}
              <input
                style={input}
                placeholder="Type a tag and press Enter (or add multiple, comma-separated)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const raw = (e.currentTarget.value || "").trim();
                    if (!raw) return;
                    raw
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean)
                      .forEach(addTag);
                    e.currentTarget.value = "";
                  }
                }}
              />

              {/* Suggestions */}
              {!!tagSuggestions.length && (
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  {tagSuggestions.slice(0, 12).map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => addTag(t)}
                      style={{
                        background: "#1e2326",
                        color: TEXT,
                        border: `1px solid ${BORDER}`,
                        borderRadius: 999,
                        padding: "6px 10px",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                      title="Add tag"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 16,
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                color: TEXT,
                fontWeight: 900,
                border: `1.3px solid ${BORDER}`,
                borderRadius: 10,
                padding: "10px 16px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                background: GOLD,
                color: "#191a1d",
                fontWeight: 900,
                border: "none",
                borderRadius: 10,
                padding: "10px 18px",
                cursor: "pointer",
                boxShadow: "0 2px 12px rgba(247,203,83,0.25)",
              }}
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
