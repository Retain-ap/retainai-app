// src/components/SmartChat.jsx
import React, { useState, useRef } from "react";

// Simulate some user and lead context
const demoLeads = [
  { id: 1, name: "Sarah Smith", tags: ["VIP"], phone: "+1123456789" },
  { id: 2, name: "Ali Rahman", tags: [], phone: "+1987654321" },
];

// --- Helper: Simulate backend NLP/AI extraction ---
// Replace with a real API POST if you want (see comment below)
async function extractAppointmentFromMessage(message) {
  const res = await fetch("http://localhost:5000/api/extract-appointment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const data = await res.json();
  if (data.title && data.date && data.time) return data;
  return null;
}


  // Simple simulated pattern matching (for demo)
  const dateRegex = /\b(on )?(\w+day|\d{4}-\d{2}-\d{2})\b/i;
  const timeRegex = /\b(\d{1,2})(:\d{2})?\s?(am|pm)?\b/i;
  const nameRegex = /\b(Sarah|Ali)\b/i;

  if (dateRegex.test(message) && timeRegex.test(message)) {
    const date = dateRegex.exec(message)[2] || "";
    const time = timeRegex.exec(message)[0] || "";
    const nameMatch = nameRegex.exec(message);
    const title = `Meeting with ${nameMatch ? nameMatch[0] : "Contact"}`;
    return { title, date, time };
  }
  return null;
}

export default function SmartChat({ leads, onAddAppointment }) {
  const [messages, setMessages] = useState([
    { from: "other", text: "Hey! Can we meet this Friday at 2pm?" },
    { from: "me", text: "Sure, let me check my calendar." }
  ]);
  const [input, setInput] = useState("");
  const [suggestion, setSuggestion] = useState(null);
  const chatRef = useRef();

  // Handle send message
  async function handleSend() {
    if (!input.trim()) return;
    const newMsg = { from: "me", text: input };
    setMessages(msgs => [...msgs, newMsg]);
    setInput("");
    // AI/NLP Extraction
    const found = await extractAppointmentFromMessage(input);
    if (found) setSuggestion(found);
    else setSuggestion(null);
    // Scroll to bottom
    setTimeout(() => {
      if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }, 80);
  }

  // Handle add suggestion to appointments
  function handleQuickAdd() {
    if (suggestion && onAddAppointment) {
      // Simple: always assign to first lead (replace with logic to pick lead)
      onAddAppointment({
        leadId: leads[0]?.id || 1,
        title: suggestion.title,
        date: new Date().toISOString().slice(0, 10), // demo: today
        time: suggestion.time,
      });
      setMessages(msgs => [
        ...msgs,
        { from: "system", text: `✅ Added "${suggestion.title}" for ${suggestion.date} ${suggestion.time}` }
      ]);
      setSuggestion(null);
    }
  }

  return (
    <div style={{
      background: "#16191f",
      borderRadius: 14,
      maxWidth: 470,
      margin: "0 auto",
      boxShadow: "0 2px 18px #0007",
      padding: 0,
      display: "flex",
      flexDirection: "column",
      height: 470,
      position: "relative"
    }}>
      <div ref={chatRef} style={{
        flex: 1, overflowY: "auto", padding: "25px 26px 14px 26px"
      }}>
        {messages.map((m, idx) => (
          <div
            key={idx}
            style={{
              marginBottom: 13,
              alignSelf: m.from === "me" ? "flex-end" : "flex-start",
              textAlign: m.from === "me" ? "right" : "left"
            }}
          >
            <span
              style={{
                display: "inline-block",
                padding: "12px 19px",
                borderRadius: 22,
                background: m.from === "me"
                  ? "linear-gradient(92deg, #1fd67e 0%, #1ec4ea 80%)"
                  : "linear-gradient(90deg, #252525 0%, #222 80%)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "1.06em",
                boxShadow: m.from === "me" ? "0 2px 8px #1fd67e22" : "0 1px 4px #0002"
              }}
            >
              {m.text}
            </span>
          </div>
        ))}
        {suggestion && (
          <div style={{
            margin: "10px 0 5px 0",
            background: "#181818",
            color: "#f7cb53",
            padding: "12px 15px",
            borderRadius: 13,
            boxShadow: "0 2px 8px #0004"
          }}>
            <strong>Detected appointment:</strong>
            <div style={{ margin: "6px 0" }}>
              <span style={{ fontWeight: 700 }}>{suggestion.title}</span>
              <span style={{ color: "#38ff98", marginLeft: 8 }}>{suggestion.date} {suggestion.time}</span>
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
                marginTop: 8
              }}
            >Add to Appointments</button>
          </div>
        )}
      </div>
      {/* Input box */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "18px 22px", borderTop: "1.6px solid #232a32"
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSend()}
          style={{
            flex: 1,
            background: "#22262d",
            border: "none",
            color: "#fff",
            borderRadius: 8,
            fontSize: "1.07em",
            fontWeight: 500,
            padding: "10px 18px",
            marginRight: 13
          }}
          placeholder="Type a message…"
        />
        <button
          onClick={handleSend}
          style={{
            background: "linear-gradient(92deg, #1fd67e 0%, #1ec4ea 80%)",
            color: "#191919",
            fontWeight: 700,
            border: "none",
            borderRadius: 10,
            fontSize: "1.09em",
            padding: "11px 24px",
            cursor: "pointer"
          }}
        >Send</button>
      </div>
    </div>
  );
}
