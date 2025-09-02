// src/components/LeadDrawer.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";

const TABS = ["Details", "Notes", "Reminders"];

const API_BASE =
  (process.env.REACT_APP_API_BASE && process.env.REACT_APP_API_BASE.trim()) ||
  window.location.origin.replace(/\/$/, "");

function migrateNotesToUpdates(lead) {
  if (lead?.updates && Array.isArray(lead.updates)) return lead.updates;
  if (lead?.notes) {
    return [
      {
        type: "note",
        text: lead.notes,
        date: lead.createdAt || new Date().toISOString(),
        author: "user",
      },
    ];
  }
  return [];
}

export default function LeadDrawer({
  lead,
  onClose,
  onEdit,
  onDelete,
  onUpdateLead, // parent can persist single-lead updates
}) {
  const [activeTab, setActiveTab] = useState("Details");
  const [showQR, setShowQR] = useState(false);

  // hydrate from backend-provided lead
  const [updates, setUpdates] = useState(migrateNotesToUpdates(lead));
  const [reminders, setReminders] = useState(lead?.reminders || []);
  const [newReminder, setNewReminder] = useState("");

  useEffect(() => {
    setUpdates(migrateNotesToUpdates(lead));
    setReminders(lead?.reminders || []);
  }, [lead]);

  // ---------- persistence helpers ----------
  const userEmail = useMemo(() => {
    // prefer explicit key if you set it elsewhere
    const storedUE = localStorage.getItem("userEmail");
    if (storedUE) return storedUE;
    // otherwise fall back to stored user object
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      if (u?.email) return u.email;
    } catch {}
    return lead?.owner || "";
  }, [lead?.owner]);

  const persistLeadsArray = useCallback(
    async (mutateFn) => {
      if (!userEmail) return;

      // 1) pull latest list
      const res = await fetch(`${API_BASE}/api/leads/${encodeURIComponent(userEmail)}`);
      if (!res.ok) throw new Error("Failed to load leads");
      const { leads: all } = await res.json();

      // 2) update the matching lead
      const idx = all.findIndex(
        (l) =>
          String(l.id || "") === String(lead?.id || "") ||
          (lead?.email && l.email === lead.email)
      );
      if (idx === -1) return;

      const updated = { ...all[idx] };
      mutateFn(updated); // apply mutation (e.g., set reminders)
      all[idx] = updated;

      // 3) save whole list
      const save = await fetch(`${API_BASE}/api/leads/${encodeURIComponent(userEmail)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: all }),
      });
      if (!save.ok) throw new Error("Failed to save leads");
      return updated;
    },
    [lead?.email, lead?.id, userEmail]
  );

  const persistReminders = useCallback(
    async (nextReminders) => {
      // optimistic UI
      setReminders(nextReminders);

      try {
        if (typeof onUpdateLead === "function") {
          onUpdateLead({ ...lead, reminders: nextReminders });
        } else {
          await persistLeadsArray((l) => {
            l.reminders = nextReminders;
          });
        }
      } catch (e) {
        console.warn("Failed to persist reminders:", e);
      }
    },
    [lead, onUpdateLead, persistLeadsArray]
  );

  // ---------- reminders actions ----------
  const addReminder = () => {
    const t = (newReminder || "").trim();
    if (!t) return;
    const next = [...reminders, { text: t, date: new Date().toISOString() }];
    setNewReminder("");
    persistReminders(next);
  };

  const removeReminder = (i) => {
    const next = reminders.filter((_, idx) => idx !== i);
    persistReminders(next);
  };

  if (!lead) return null;

  const statusTooltip =
    lead.status === "cold"
      ? "Overdue for follow up"
      : lead.status === "warning"
      ? "Time to follow up"
      : "Active and up to date";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        height: "100vh",
        width: 415,
        background: "#212224",
        boxShadow: "-4px 0 18px #000a",
        zIndex: 5000,
        display: "flex",
        flexDirection: "column",
        borderLeft: "2.5px solid #23ffac30",
        padding: 0,
        minWidth: 415,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "26px 22px 11px 22px",
        }}
      >
        <div
          style={{
            width: 46,
            height: 46,
            background: "#313336",
            borderRadius: "50%",
            fontWeight: 800,
            color: "#bbb",
            fontSize: 21,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {(lead.name || lead.email || "??").slice(0, 2).toUpperCase()}
        </div>
        <div style={{ marginLeft: 16, flex: 1 }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 20 }}>
            {lead.name}
          </div>
          <div style={{ color: "#aaa", fontSize: 15 }}>{lead.email}</div>
        </div>
        <button
          style={{
            marginLeft: "auto",
            background: "none",
            color: "#aaa",
            border: "none",
            fontWeight: 900,
            fontSize: 28,
            cursor: "pointer",
            padding: 8,
          }}
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 10, padding: "0 17px" }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            style={{
              background: activeTab === tab ? "#232323" : "none",
              color: activeTab === tab ? "#fff" : "#aaa",
              fontWeight: 700,
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              padding: "8px 22px",
              cursor: "pointer",
              marginBottom: 4,
            }}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "4px 25px 0 25px",
          color: "#ccc",
          fontSize: 16,
        }}
      >
        {activeTab === "Details" && (
          <div style={{ marginBottom: 14 }}>
            <div>
              <b>Status:</b>{" "}
              <span
                style={{
                  color: "#fff",
                  background: lead.status_color || "#aaa",
                  borderRadius: 12,
                  padding: "2px 15px",
                  fontWeight: 700,
                  fontSize: 13,
                  marginLeft: 2,
                  textTransform: "capitalize",
                }}
                title={statusTooltip}
              >
                {lead.status === "cold"
                  ? "Overdue"
                  : lead.status === "warning"
                  ? "Follow Up"
                  : "Active"}
              </span>
            </div>
            <div>
              <b>Phone:</b> {lead.phone || "-"}
            </div>
            <div>
              <b>Birthday:</b> {lead.birthday || "-"}
            </div>
            <div>
              <b>Tags:</b>{" "}
              {(lead.tags || []).map((t) => (
                <span
                  key={t}
                  style={{
                    background: "#232323",
                    color: "#aaa",
                    borderRadius: 8,
                    padding: "1.5px 9px",
                    fontWeight: 700,
                    fontSize: 12,
                    border: "1px solid #444",
                    marginRight: 5,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {activeTab === "Notes" && (
          <div>
            {updates.length === 0 && (
              <div style={{ color: "#888", fontStyle: "italic" }}>No notes yet.</div>
            )}
            {updates.map((u, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 10,
                  paddingBottom: 7,
                  borderBottom: i !== updates.length - 1 ? "1px solid #232323" : "none",
                }}
              >
                <div style={{ fontSize: 13, color: "#999", fontWeight: 700 }}>
                  {u.type === "note" && "Note"}
                  {u.type === "voice" && "Voice Note"}
                  {u.type === "ai" && "AI"}
                  <span style={{ color: "#aaa", fontWeight: 400, marginLeft: 6 }}>
                    {u.date ? new Date(u.date).toLocaleString() : ""}
                  </span>
                </div>
                {u.type === "note" && <div style={{ color: "#eee" }}>{u.text}</div>}
                {u.type === "voice" && (
                  <div>
                    <audio controls src={u.audioUrl} style={{ margin: "7px 0" }} />
                    <div style={{ fontSize: 13, color: "#eee" }}>
                      Transcript: {u.transcript}
                    </div>
                  </div>
                )}
                {u.type === "ai" && (
                  <div style={{ color: "#1bc982" }}>
                    <strong>AI Suggestion:</strong> {u.text}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === "Reminders" && (
          <div>
            {reminders.length === 0 && (
              <div style={{ color: "#888" }}>No reminders yet.</div>
            )}
            {reminders.map((r, i) => (
              <div
                key={`${r.text}-${r.date}-${i}`}
                style={{
                  marginBottom: 10,
                  background: "#232323",
                  padding: "8px 13px",
                  borderRadius: 9,
                  color: "#f7cb53",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                • {r.text}
                <span style={{ color: "#aaa", marginLeft: 7, fontSize: 13 }}>
                  {r.date && new Date(r.date).toLocaleString()}
                </span>
                <button
                  style={{
                    marginLeft: "auto",
                    background: "none",
                    border: "none",
                    color: "#e66565",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: 18,
                  }}
                  onClick={() => removeReminder(i)}
                  title="Delete reminder"
                >
                  ×
                </button>
              </div>
            ))}

            {/* Add reminder */}
            <div style={{ display: "flex", gap: 8, marginTop: 15 }}>
              <input
                value={newReminder}
                onChange={(e) => setNewReminder(e.target.value)}
                placeholder="Add reminder…"
                style={{
                  flex: 1,
                  background: "#191919",
                  color: "#eee",
                  border: "1px solid #444",
                  borderRadius: 7,
                  padding: "7px 10px",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addReminder();
                }}
              />
              <button
                onClick={addReminder}
                style={{
                  background: "#f7cb53",
                  color: "#232323",
                  fontWeight: 700,
                  border: "none",
                  borderRadius: 7,
                  padding: "7px 14px",
                  cursor: "pointer",
                }}
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div
        style={{
          display: "flex",
          gap: 10,
          margin: 0,
          padding: "18px 24px",
          borderTop: "1px solid #232323",
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        <button
          style={{
            background: "#232323",
            color: "#fff",
            fontWeight: 900,
            border: "1.2px solid #888",
            borderRadius: 8,
            padding: "10px 24px",
            fontSize: 16,
            cursor: "pointer",
          }}
          onClick={onEdit}
        >
          Edit
        </button>
        <button
          style={{
            background: "#232323",
            color: "#e66565",
            fontWeight: 900,
            border: "1.2px solid #e66565",
            borderRadius: 8,
            padding: "10px 24px",
            fontSize: 16,
            cursor: "pointer",
          }}
          onClick={onDelete}
        >
          Delete
        </button>

        {lead.phone && (
          <>
            <button
              style={{
                background: "#1bc982",
                color: "#232323",
                fontWeight: 900,
                border: "none",
                borderRadius: 8,
                padding: "10px 24px",
                fontSize: 16,
                cursor: "pointer",
              }}
              onClick={() => setShowQR(true)}
              title="Scan to call"
            >
              Call
            </button>
            {showQR && (
              <div
                style={{
                  position: "fixed",
                  left: 0,
                  top: 0,
                  width: "100vw",
                  height: "100vh",
                  background: "#000b",
                  zIndex: 10000,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onClick={() => setShowQR(false)}
              >
                <div
                  style={{
                    background: "#232324",
                    borderRadius: 20,
                    boxShadow: "0 2px 20px #000b",
                    padding: 36,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <QRCodeSVG value={`tel:${lead.phone}`} size={170} fgColor="#1bc982" />
                  <div
                    style={{
                      color: "#bbb",
                      marginTop: 16,
                      fontWeight: 600,
                      fontSize: 16,
                    }}
                  >
                    Scan to call {lead.phone}
                  </div>
                  <button
                    style={{
                      marginTop: 22,
                      background: "#1bc982",
                      color: "#232323",
                      fontWeight: 800,
                      border: "none",
                      borderRadius: 9,
                      padding: "9px 34px",
                      fontSize: 18,
                      cursor: "pointer",
                    }}
                    onClick={() => setShowQR(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
