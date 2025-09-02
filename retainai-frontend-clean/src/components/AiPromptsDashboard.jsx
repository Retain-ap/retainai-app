// src/components/AiPromptsDashboard.jsx
import { API_BASE } from "../config";
import React, { useState, useMemo } from "react";
import "./AiPrompts.css";

// Prompt types
const PROMPT_TYPES = [
  { key: "followup", label: "Follow Up",     instruction: "Write a friendly, personalized follow-up." },
  { key: "reengage", label: "Re-engage",     instruction: "Write a gentle, empathetic message to re-engage an inactive client." },
  { key: "birthday", label: "Birthday",      instruction: "Write a warm, personalized birthday greeting." },
  { key: "apology",  label: "Apology",       instruction: "Write a sincere apology for a mistake or bad experience." },
  { key: "upsell",   label: "Upsell",        instruction: "Write a thoughtful message recommending an additional service or product." },
];

export default function AiPromptsDashboard({
  leads = [],
  user = {},
  onSendAIPromptEmail // optional override
}) {
  const [search, setSearch]           = useState("");
  const [focusedLead, setFocusedLead] = useState(null);
  const [responses, setResponses]     = useState({});
  const [loading, setLoading]         = useState({});
  const [notifStatus, setNotifStatus] = useState({});
  const [activeTab, setActiveTab]     = useState(PROMPT_TYPES[0].key);
  const [copied, setCopied]           = useState({});

  // Prefer true brand; fall back gently
  const getBrandName = () =>
    user.business || user.businessName || user.lineOfBusiness || "Your Business";
  const getBusinessType = () =>
    user.businessType || "";
  const getUserName = () =>
    user.name || user.email?.split("@")[0] || "Your Team";

  // filter leads
  const filteredLeads = useMemo(() => {
    const q = search.toLowerCase();
    return leads.filter(
      l =>
        (l.name  && l.name.toLowerCase().includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }, [leads, search]);

  // generate AI
  const handleGenerate = async (leadId, lead, type) => {
    setLoading(l => ({ ...l, [leadId]: true }));
    setResponses(r => ({ ...r, [leadId]: { ...r[leadId], [type]: "" } }));

    const p = PROMPT_TYPES.find(pt => pt.key === type) || {};
    try {
      const res = await fetch(`${API_BASE}/api/generate_prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail:     user.email,            // let backend load saved brand
          leadName:      lead.name || "",
          businessName:  getBrandName(),        // e.g. "jaivio nails"
          businessType:  getBusinessType(),     // e.g. "nail salon"
          userName:      getUserName(),
          tags:          (lead.tags || []).join(", "),
          notes:         lead.notes || "",
          lastContacted: lead.last_contacted,
          status:        lead.status || "",
          promptType:    type,
          instruction:   p.instruction || ""
        })
      });
      const data = await res.json();
      let out = (data.prompt || data.error || "").trim();
      out = out.replace(/^(?=.*subject:).*$/gim, "").trim();
      setResponses(r => ({
        ...r,
        [leadId]: { ...r[leadId], [type]: out }
      }));
    } catch {
      setResponses(r => ({
        ...r,
        [leadId]: { ...r[leadId], [type]: "AI error." }
      }));
    }
    setLoading(l => ({ ...l, [leadId]: false }));
  };

  // send email
  const handleSend = async (lead, message, type) => {
    if (typeof onSendAIPromptEmail === "function") {
      return onSendAIPromptEmail(lead, message, type);
    }
    setNotifStatus(s => ({ ...s, [lead.id]: "sending" }));
    const subject = `${getUserName()} at ${getBrandName()}`;
    try {
      const res = await fetch(`${API_BASE}/api/send-ai-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadEmail:    lead.email,
          userEmail:    user.email,
          message,
          subject,
          promptType:   type,
          leadName:     lead.name || "",
          userName:     getUserName(),
          businessName: getBrandName(),
        })
      });
      setNotifStatus(s => ({
        ...s,
        [lead.id]: res.ok ? "success" : "error"
      }));
    } catch {
      setNotifStatus(s => ({ ...s, [lead.id]: "error" }));
    }
    setTimeout(() => {
      setNotifStatus(s => ({ ...s, [lead.id]: undefined }));
    }, 2500);
  };

  // copy
  const handleCopy = (leadId, tab) => {
    const text = responses[leadId]?.[tab];
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(c => ({ ...c, [`${leadId}-${tab}`]: true }));
    setTimeout(() => {
      setCopied(c => ({ ...c, [`${leadId}-${tab}`]: false }));
    }, 1200);
  };

  // render
  return (
    <div className="ai-root">
      {!focusedLead ? (
        <>
          <div className="ai-header">
            <h2>AI Smart Prompts & Retention Messaging</h2>
            <input
              className="ai-search"
              placeholder="Search leads by name, email, or tag…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="ai-grid">
            {filteredLeads.length === 0 ? (
              <div className="ai-grid-empty">
                No leads found. Try another search.
              </div>
            ) : filteredLeads.map(lead => (
              <div
                key={lead.id}
                className="ai-card"
                onClick={() => setFocusedLead(lead)}
              >
                <div className="lead-name">{lead.name || "(No Name)"}</div>
                <div className="lead-email">{lead.email}</div>
                <div className="lead-status">
                  Status: <span>{lead.status || "—"}</span>
                </div>
                <div className="lead-tags">
                  Tags:{" "}
                  {lead.tags?.length
                    ? lead.tags.map(t => <span key={t} className="tag">{t}</span>)
                    : "—"}
                </div>
                <div className="lead-notes">
                  Notes: {lead.notes || "—"}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="ai-detail-container">
          <button className="ai-back" onClick={() => setFocusedLead(null)}>
            ← Back to all leads
          </button>
          <div className="ai-detail-card">
            <div className="ai-detail-title">{focusedLead.name}</div>
            <div className="ai-detail-subtitle">{focusedLead.email}</div>
            <div className="ai-detail-status">
              Status: <span>{focusedLead.status || "—"}</span>
            </div>
            <div className="ai-detail-tags">
              Tags:{" "}
              {focusedLead.tags?.length
                ? focusedLead.tags.map(t => <span key={t} className="tag">{t}</span>)
                : "—"}
            </div>
            <div className="ai-detail-notes">
              Notes: {focusedLead.notes || "—"}
            </div>

            <div className="ai-tabs">
              {PROMPT_TYPES.map(pt => (
                <button
                  key={pt.key}
                  className={`ai-tab${activeTab === pt.key ? " active" : ""}`}
                  onClick={() => setActiveTab(pt.key)}
                >
                  {pt.label}
                </button>
              ))}
            </div>

            <button
              className="ai-generate"
              onClick={() => handleGenerate(focusedLead.id, focusedLead, activeTab)}
              disabled={loading[focusedLead.id]}
            >
              {loading[focusedLead.id]
                ? "Generating..."
                : `Generate ${PROMPT_TYPES.find(pt => pt.key === activeTab)?.label} AI`}
            </button>

            {responses[focusedLead.id]?.[activeTab] && (
              <div className="ai-response">
                <strong>AI Suggestion:</strong>
                <p className="ai-response-text">
                  {responses[focusedLead.id][activeTab]}
                </p>
                <button
                  className="ai-response-copy"
                  onClick={() => handleCopy(focusedLead.id, activeTab)}
                >
                  {copied[`${focusedLead.id}-${activeTab}`] ? "Copied!" : "Copy"}
                </button>
                <button
                  className="ai-response-send"
                  onClick={() =>
                    handleSend(
                      focusedLead,
                      responses[focusedLead.id][activeTab],
                      activeTab
                    )
                  }
                  disabled={loading[focusedLead.id]}
                >
                  {notifStatus[focusedLead.id] === "sending"
                    ? "Sending..."
                    : notifStatus[focusedLead.id] === "success"
                      ? "Sent!"
                      : notifStatus[focusedLead.id] === "error"
                        ? "Error"
                        : "Send Notification"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
