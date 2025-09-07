// src/components/AiPromptsDashboard.jsx
import React, { useState, useMemo } from "react";
import { api } from "../lib/api"; // <-- shared fetch helper (credentials included)

// keep your option lists
const SUGGESTION_TYPES = [
  { key: "followup", label: "Follow Up" },
  { key: "birthday", label: "Birthday" },
  { key: "apology", label: "Apology" },
  { key: "vip", label: "VIP Outreach" },
  { key: "reactivation", label: "Cold Lead Reactivation" },
  { key: "promo", label: "Promotion/Offer" },
];

const TONE_OPTIONS = [
  { key: "friendly", label: "Friendly" },
  { key: "professional", label: "Professional" },
  { key: "fun", label: "Fun" },
  { key: "caring", label: "Caring" },
];

export default function AiPromptsDashboard({
  leads = [],
  user = {},
  onSendNotification, // Optional: for direct send
}) {
  // support either id or _id from your lead objects
  const firstLeadId = leads[0]?.id || leads[0]?._id || "";
  const [selectedLeadId, setSelectedLeadId] = useState(firstLeadId);
  const [suggestionType, setSuggestionType] = useState("followup");
  const [tone, setTone] = useState("friendly");
  const [promptResult, setPromptResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiReason, setAiReason] = useState("");
  const [error, setError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // find selected lead (by id or _id)
  const lead = useMemo(() => {
    return (
      leads.find((l) => l.id === selectedLeadId || l._id === selectedLeadId) ||
      leads[0] ||
      {}
    );
  }, [leads, selectedLeadId]);

  // build the prompt for your backend
  function buildPrompt() {
    return `
You are RetainAI, an emotionally intelligent CRM assistant for a ${user.lineOfBusiness || user.businessType || "business"}.
Your job is to write a personalized "${suggestionType}" message to this lead, always using their real name, context, and never leaving placeholders.

Lead info:
- Name: ${lead.name || ""}
- Email: ${lead.email || ""}
- Tags: ${Array.isArray(lead.tags) ? lead.tags.join(", ") : ""}
- Last Contacted: ${lead.last_contacted || lead.lastContacted || lead.createdAt || ""}
- Birthday: ${lead.birthday || "N/A"}
- Notes: ${lead.notes || "N/A"}
- VIP: ${Array.isArray(lead.tags) && lead.tags.includes("VIP") ? "Yes" : "No"}

Business info:
- Business type: ${user.lineOfBusiness || user.businessType || ""}
- User (you): ${user.name || user.email || ""}

Context:
- Most recent message: ${lead.lastMessage || "N/A"}

Requirements:
- Make it sound ${tone}
- DO NOT use placeholders like (lead name), always use the actual info
- The purpose: ${SUGGESTION_TYPES.find((t) => t.key === suggestionType)?.label || "Follow Up"}
- Make it succinct and high-retention.
- Add a greeting and closing if natural.

Explain your reasoning in 2 sentences below the message.
`.trim();
  }

  // call backend using the shared api helper (sends cookies, no SW cache)
  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    setPromptResult("");
    setAiReason("");
    try {
      const data = await api.post("/api/generate_prompt", {
        prompt: buildPrompt(),
        // include a little context the backend might want to log
        lead_id: lead.id || lead._id || null,
      });

      // Expecting { prompt: "..." }
      const text = data?.prompt || "";
      if (!text) {
        setError("No prompt returned from API.");
      } else {
        const split = text.split("AI reasoning:");
        setPromptResult(split[0].trim());
        setAiReason(split[1]?.trim() || "");
      }
    } catch (e) {
      // surfaces backend error if api helper throws with message
      setError(e?.message || "Failed to generate prompt.");
    } finally {
      setLoading(false);
    }
  };

  // copy to clipboard
  const copyToClipboard = () => {
    if (promptResult) navigator.clipboard.writeText(promptResult);
  };

  return (
    <div
      style={{
        background: "#191a1d",
        borderRadius: 22,
        padding: "38px 30px 40px 30px",
        maxWidth: 620,
        margin: "38px auto 0 auto",
        color: "#f7cb53",
        boxShadow: "0 6px 36px #000b",
        animation: "fadein 0.6s",
      }}
    >
      <h2
        style={{
          color: "#f7cb53",
          marginBottom: 19,
          fontWeight: 900,
          fontSize: 25,
          letterSpacing: 0.5,
        }}
      >
        Retention AI — Smart Prompts
      </h2>

      {/* Lead/Tone pickers */}
      <div style={{ display: "flex", gap: 18, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ color: "#fff" }}>Select Lead</label>
          <br />
          <select
            style={{
              background: "#252525",
              color: "#f7cb53",
              padding: "8px 14px",
              border: "1.5px solid #f7cb53",
              borderRadius: 9,
              width: "100%",
            }}
            value={selectedLeadId}
            onChange={(e) => setSelectedLeadId(e.target.value)}
          >
            {leads.map((l) => {
              const value = l.id || l._id || l.email || l.name;
              return (
                <option key={value} value={value}>
                  {l.name || l.email || value}
                </option>
              );
            })}
          </select>
        </div>
        <div>
          <label style={{ color: "#fff" }}>Suggestion</label>
          <br />
          <select
            style={{
              background: "#252525",
              color: "#f7cb53",
              padding: "8px 14px",
              border: "1.5px solid #f7cb53",
              borderRadius: 9,
            }}
            value={suggestionType}
            onChange={(e) => setSuggestionType(e.target.value)}
          >
            {SUGGESTION_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ color: "#fff" }}>Tone</label>
          <br />
          <select
            style={{
              background: "#252525",
              color: "#f7cb53",
              padding: "8px 14px",
              border: "1.5px solid #f7cb53",
              borderRadius: 9,
            }}
            value={tone}
            onChange={(e) => setTone(e.target.value)}
          >
            {TONE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Advanced lead context toggle */}
      <div style={{ margin: "7px 0 15px 0", textAlign: "right" }}>
        <span
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            color: "#38ff98",
            cursor: "pointer",
            fontSize: 15,
            textDecoration: "underline",
            fontWeight: 600,
          }}
        >
          {showAdvanced ? "Hide details ▲" : "Show lead context ▼"}
        </span>
      </div>

      {showAdvanced && (
        <div
          style={{
            background: "#232323",
            borderRadius: 8,
            padding: "13px 17px",
            marginBottom: 15,
            color: "#d7ffe0",
            fontSize: 15,
          }}
        >
          <b>Name:</b> {lead.name || "—"} <br />
          <b>Email:</b> {lead.email || "—"} <br />
          <b>Tags:</b> {Array.isArray(lead.tags) ? lead.tags.join(", ") : ""} <br />
          <b>Last Contacted:</b> {lead.last_contacted || lead.createdAt || "—"} <br />
          <b>Notes:</b> {lead.notes || "—"} <br />
          <b>Birthday:</b> {lead.birthday || "—"} <br />
          <b>Business:</b> {user.lineOfBusiness || user.businessType || "—"}
        </div>
      )}

      {/* Action */}
      <button
        onClick={handleGenerate}
        disabled={loading || !selectedLeadId}
        style={{
          background: "#f7cb53",
          color: "#181818",
          fontWeight: 700,
          border: "none",
          borderRadius: "13px",
          padding: "14px 34px",
          fontSize: "1.17em",
          marginTop: 5,
          cursor: loading ? "not-allowed" : "pointer",
          boxShadow: "0 2px 8px #0007",
          transition: "background 0.18s",
          opacity: loading || !selectedLeadId ? 0.7 : 1,
        }}
      >
        {loading ? "Generating..." : "Generate AI Suggestion"}
      </button>

      {/* Results */}
      {promptResult && (
        <div
          style={{
            marginTop: 30,
            background: "#222",
            borderRadius: 15,
            padding: "20px 20px 18px 23px",
            color: "#f7cb53",
            boxShadow: "0 3px 16px #0004",
            animation: "slideup .7s",
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
            <span role="img" aria-label="chat">
              💡
            </span>{" "}
            AI Suggestion
            <button
              style={{
                float: "right",
                fontSize: 13,
                background: "none",
                color: "#38ff98",
                border: "none",
                cursor: "pointer",
              }}
              onClick={copyToClipboard}
              title="Copy to clipboard"
            >
              Copy
            </button>
          </div>
          <div
            style={{
              fontSize: 18,
              color: "#fff",
              marginBottom: 10,
              whiteSpace: "pre-line",
            }}
          >
            {promptResult}
          </div>
          {aiReason && (
            <div
              style={{
                color: "#a8ffe5",
                fontSize: 14,
                marginTop: 8,
                fontStyle: "italic",
              }}
            >
              <b>AI Reasoning:</b> {aiReason}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <button
              style={{
                marginRight: 12,
                padding: "7px 20px",
                borderRadius: 7,
                border: "none",
                fontWeight: 700,
                background: "#181818",
                color: "#f7cb53",
                cursor: "pointer",
              }}
              onClick={handleGenerate}
            >
              Regenerate
            </button>
            {onSendNotification && (
              <button
                style={{
                  padding: "7px 20px",
                  borderRadius: 7,
                  border: "none",
                  fontWeight: 700,
                  background: "#38ff98",
                  color: "#191919",
                  cursor: "pointer",
                }}
                onClick={() => onSendNotification(lead, promptResult)}
              >
                Send Notification
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            background: "#321",
            color: "#ff5656",
            borderRadius: 9,
            padding: "10px 15px",
            marginTop: 16,
          }}
        >
          {error}
        </div>
      )}

      <style>
        {`
        @keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideup { from { transform: translateY(44px); opacity: 0; } to { transform: none; opacity: 1; } }
        `}
      </style>
    </div>
  );
}
