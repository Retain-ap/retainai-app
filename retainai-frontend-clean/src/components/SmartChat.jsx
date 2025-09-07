// src/components/SmartChat.jsx
import React, { useState, useRef } from "react";

// Optional demo leads if none are passed
const demoLeads = [
  { id: 1, name: "Sarah Smith", tags: ["VIP"], phone: "+1123456789" },
  { id: 2, name: "Ali Rahman", tags: [], phone: "+1987654321" },
];

// ---- API base (CRA + Vite safe) ----
const RAW_API_BASE =
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

const API_BASE = String(RAW_API_BASE || "").replace(/\/$/, "");

// --- Small helper: fetch with timeout (guards hanging requests) ---
async function apiFetch(url, options = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/* ---------------- Local fallback extractor (robust & safe) ---------------- */
function pad2(n) {
  return String(n).padStart(2, "0");
}
function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function nextDow(from, targetDow) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const curr = d.getDay();
  let delta = (targetDow - curr + 7) % 7;
  if (delta === 0) delta = 7; // pick the next occurrence if "Friday" mentioned without "today"
  d.setDate(d.getDate() + delta);
  return d;
}
function parseTimeToHHMM(t) {
  if (!t) return null;
  const m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!m) return null;
  let hh = parseInt(m[1], 10);
  let mm = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3]?.toLowerCase();
  if (ampm === "pm" && hh < 12) hh += 12;
  if (ampm === "am" && hh === 12) hh = 0;
  // If no am/pm and hour 1..7, bias toward afternoon (simple heuristic)
  if (!ampm && hh >= 1 && hh <= 7) hh += 12;
  return `${pad2(hh)}:${pad2(mm)}`;
}
function findLeadNameInMessage(message, leads) {
  const low = message.toLowerCase();
  for (const l of leads || []) {
    const first = String(l.name || "").split(/\s+/)[0];
    if (!first) continue;
    if (low.includes(first.toLowerCase())) return l.name;
  }
  return null;
}
function localExtract(message, leads) {
  const text = String(message || "");
  if (!text.trim()) return null;

  // Try ISO date first (YYYY-MM-DD)
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  let dateISO = null;

  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (!isNaN(dt.getTime())) dateISO = toISODate(dt);
  } else {
    // Day of week?
    const dowMatch = text.match(
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
    );
    if (dowMatch) {
      const map = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
      };
      const target = map[dowMatch[1].toLowerCase()];
      dateISO = toISODate(nextDow(new Date(), target));
    } else {
      // today / tomorrow
      if (/\btoday\b/i.test(text)) {
        dateISO = toISODate(new Date());
      } else if (/\btomorrow\b/i.test(text)) {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        dateISO = toISODate(d);
      }
    }
  }

  const timeHHMM = parseTimeToHHMM(text);
  if (!dateISO || !timeHHMM) return null;

  const detectedName = findLeadNameInMessage(text, leads);
  const title = `Meeting with ${detectedName || "Contact"}`;
  return { title, date: dateISO, time: timeHHMM };
}

/* ---------------- First try API, then fallback to local ---------------- */
async function extractAppointmentFromMessage(message, leads) {
  try {
    const res = await apiFetch(`${API_BASE}/api/extract-appointment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data?.title && data?.date && data?.time) {
        return {
          title: data.title,
          date: data.date, // expect YYYY-MM-DD
          time: data.time, // expect HH:mm or h:mm am/pm
        };
      }
    }
  } catch {
    // swallow network/timeout; we'll fallback below
  }
  return localExtract(message, leads);
}

/* ====================================================================== */

export default function SmartChat({ leads = demoLeads, onAddAppointment }) {
  const [messages, setMessages] = useState([
    { from: "other", text: "Hey! Can we meet this Friday at 2pm?" },
    { from: "me", text: "Sure, let me check my calendar." },
  ]);
  const [input, setInput] = useState("");
  const [suggestion, setSuggestion] = useState(null);
  const chatRef = useRef();

  // Handle send message
  async function handleSend() {
    const text = input.trim();
    if (!text) return;

    const newMsg = { from: "me", text };
    setMessages((msgs) => [...msgs, newMsg]);
    setInput("");

    // AI/NLP Extraction (API with local fallback)
    const found = await extractAppointmentFromMessage(text, leads);
    setSuggestion(found || null);

    // Scroll to bottom
    requestAnimationFrame(() => {
      if (chatRef.current) {
        chatRef.current.scrollTop = chatRef.current.scrollHeight;
      }
    });
  }

  // Handle add suggestion to appointments
  function handleQuickAdd() {
    if (suggestion && onAddAppointment) {
      // Try to match the lead by name mention; otherwise default to first lead
      const detectedLead =
        leads.find((l) =>
          suggestion.title.toLowerCase().includes(
            String(l.name || "").split(/\s+/)[0].toLowerCase()
          )
        ) || leads[0];

      onAddAppointment({
        leadId: detectedLead?.id || 1,
        title: suggestion.title,
        date: suggestion.date, // use detected date (YYYY-MM-DD)
        time: suggestion.time, // use detected time (HH:mm)
      });

      setMessages((msgs) => [
        ...msgs,
        {
          from: "system",
          text: `✅ Added "${suggestion.title}" for ${suggestion.date} ${suggestion.time}`,
        },
      ]);
      setSuggestion(null);
    }
  }

  return (
    <div
      style={{
        background: "#16191f",
        borderRadius: 14,
        maxWidth: 470,
        margin: "0 auto",
        boxShadow: "0 2px 18px #0007",
        padding: 0,
        display: "flex",
        flexDirection: "column",
        height: 470,
        position: "relative",
      }}
    >
      <div
        ref={chatRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "25px 26px 14px 26px",
        }}
      >
        {messages.map((m, idx) => (
          <div
            key={idx}
            style={{
              marginBottom: 13,
              alignSelf: m.from === "me" ? "flex-end" : "flex-start",
              textAlign: m.from === "me" ? "right" : "left",
            }}
          >
            <span
              style={{
                display: "inline-block",
                padding: "12px 19px",
                borderRadius: 22,
                background:
                  m.from === "me"
                    ? "linear-gradient(92deg, #1fd67e 0%, #1ec4ea 80%)"
                    : m.from === "system"
                    ? "linear-gradient(90deg, #2a2a2a 0%, #262626 80%)"
                    : "linear-gradient(90deg, #252525 0%, #222 80%)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "1.06em",
                boxShadow:
                  m.from === "me"
                    ? "0 2px 8px #1fd67e22"
                    : "0 1px 4px #0002",
              }}
            >
              {m.text}
            </span>
          </div>
        ))}

        {suggestion && (
          <div
            style={{
              margin: "10px 0 5px 0",
              background: "#181818",
              color: "#f7cb53",
              padding: "12px 15px",
              borderRadius: 13,
              boxShadow: "0 2px 8px #0004",
            }}
          >
            <strong>Detected appointment:</strong>
            <div style={{ margin: "6px 0" }}>
              <span style={{ fontWeight: 700 }}>{suggestion.title}</span>
              <span style={{ color: "#38ff98", marginLeft: 8 }}>
                {suggestion.date} {suggestion.time}
              </span>
            </div>
            <button
              onClick={handleQuickAdd}
              style={{
                background: "#38ff98",
                color: "#222",
                border: "none",
                borderRadius: 8,
                fontWeight: 700,
                padding: "6px 24px",
                fontSize: "1em",
                cursor: "pointer",
                marginTop: 8,
              }}
            >
              Add to Appointments
            </button>
          </div>
        )}
      </div>

      {/* Input box */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "18px 22px",
          borderTop: "1.6px solid #232a32",
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          style={{
            flex: 1,
            background: "#22262d",
            border: "none",
            color: "#fff",
            borderRadius: 8,
            fontSize: "1.07em",
            fontWeight: 500,
            padding: "10px 18px",
            marginRight: 13,
          }}
          placeholder="Type a message…"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          style={{
            background:
              "linear-gradient(92deg, #1fd67e 0%, #1ec4ea 80%)",
            color: "#191919",
            fontWeight: 700,
            border: "none",
            borderRadius: 10,
            fontSize: "1.09em",
            padding: "11px 24px",
            cursor: input.trim() ? "pointer" : "not-allowed",
            opacity: input.trim() ? 1 : 0.6,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
