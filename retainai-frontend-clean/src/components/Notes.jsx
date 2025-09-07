// src/components/Notes.jsx
import React, { useMemo, useState } from "react";

const UI = {
  CARD: "#232323",
  BORDER: "#2b2b2f",
  TEXT: "#e9edef",
  SUB: "#9aa4ad",
  GOLD: "#F5D87E",
  GREEN: "#1bc982",
};

function safeTs(d) {
  if (!d) return 0;
  const t = Date.parse(d);
  return Number.isFinite(t) ? t : 0;
}

function normalizeNotes(leads = []) {
  const rows = [];
  for (const lead of leads) {
    const leadName = lead?.name || lead?.email || "Unknown";
    const leadId = lead?.id ?? leadName;

    // Preferred: updates (note | voice | ai)
    if (Array.isArray(lead?.updates)) {
      for (let i = 0; i < lead.updates.length; i++) {
        const u = lead.updates[i] || {};
        if (!u) continue;
        const type = (u.type || "note").toLowerCase();
        if (type === "note" && !u.text) continue;

        rows.push({
          key: `${leadId}|u|${i}|${u.date || ""}`,
          leadName,
          type,                               // note | voice | ai
          text: u.text || "",
          date: u.date || lead.createdAt || null,
          ts: safeTs(u.date || lead.createdAt),
          audioUrl: u.audioUrl || null,
          transcript: u.transcript || "",
        });
      }
      continue; // if updates exist, prefer them over legacy notes
    }

    // Legacy: notes can be array of objects/strings or a single string
    if (Array.isArray(lead?.notes)) {
      for (let i = 0; i < lead.notes.length; i++) {
        const n = lead.notes[i];
        if (!n) continue;
        if (typeof n === "string") {
          rows.push({
            key: `${leadId}|n|${i}`,
            leadName,
            type: "note",
            text: n,
            date: lead.createdAt || null,
            ts: safeTs(lead.createdAt),
          });
        } else {
          rows.push({
            key: `${leadId}|n|${i}|${n.date || ""}`,
            leadName,
            type: "note",
            text: n.text || "",
            date: n.date || lead.createdAt || null,
            ts: safeTs(n.date || lead.createdAt),
          });
        }
      }
    } else if (typeof lead?.notes === "string" && lead.notes.trim()) {
      rows.push({
        key: `${leadId}|n|0`,
        leadName,
        type: "note",
        text: lead.notes,
        date: lead.createdAt || null,
        ts: safeTs(lead.createdAt),
      });
    }
  }

  // newest first
  rows.sort((a, b) => b.ts - a.ts);
  return rows;
}

export default function Notes({ leads = [], limit = 500 }) {
  const [q, setQ] = useState("");

  const allNotes = useMemo(() => {
    const rows = normalizeNotes(leads);
    if (!q.trim()) return rows.slice(0, limit);
    const s = q.trim().toLowerCase();
    return rows.filter(r =>
      (r.leadName || "").toLowerCase().includes(s) ||
      (r.text || "").toLowerCase().includes(s) ||
      (r.transcript || "").toLowerCase().includes(s)
    ).slice(0, limit);
  }, [leads, q, limit]);

  return (
    <div
      style={{
        background: UI.CARD,
        border: `1px solid ${UI.BORDER}`,
        borderRadius: 12,
        padding: 16,
        color: UI.TEXT,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontWeight: 900 }}>✍️ All Notes</h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes or names…"
            style={{
              background: "#181a1b",
              color: UI.TEXT,
              border: `1px solid ${UI.BORDER}`,
              borderRadius: 10,
              padding: "8px 10px",
              fontSize: 14,
              minWidth: 220,
              outline: "none",
            }}
          />
        </div>
      </div>

      {allNotes.length === 0 ? (
        <p style={{ color: UI.SUB, margin: "8px 0 0" }}>No notes yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {allNotes.map((n) => (
            <li
              key={n.key}
              style={{
                borderTop: `1px solid ${UI.BORDER}`,
                padding: "10px 0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong>{n.leadName}</strong>
                <TypeBadge type={n.type} />
                <small style={{ color: UI.SUB }}>
                  {n.ts ? new Date(n.ts).toLocaleString() : ""}
                </small>
              </div>

              {/* Text / transcript */}
              {n.type === "voice" ? (
                <div style={{ marginTop: 8 }}>
                  {n.audioUrl ? (
                    <audio controls src={n.audioUrl} style={{ width: "100%", maxWidth: 420 }} />
                  ) : null}
                  {n.transcript ? (
                    <div style={{ color: UI.TEXT, marginTop: 6, whiteSpace: "pre-wrap" }}>
                      <span style={{ color: UI.SUB }}>Transcript:</span> {n.transcript}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{n.text}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TypeBadge({ type }) {
  const label =
    type === "voice" ? "Voice" :
    type === "ai" ? "AI" :
    "Note";
  const color =
    type === "ai" ? UI.GREEN :
    type === "voice" ? UI.GOLD :
    UI.SUB;

  return (
    <span
      style={{
        color: type === "note" ? UI.SUB : "#1b1b1b",
        background: type === "note" ? "transparent" : color,
        border: `1px solid ${type === "note" ? UI.BORDER : color}`,
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        padding: "2px 8px",
      }}
    >
      {label}
    </span>
  );
}
