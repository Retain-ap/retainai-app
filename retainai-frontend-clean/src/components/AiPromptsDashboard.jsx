// src/components/AiPromptsDashboard.jsx
import React, { useState, useMemo } from "react";
import { api } from "../lib/api"; // ← use shared API helper (credentials included)
import "./AiPrompts.css";

// Prompt types
const PROMPT_TYPES = [
  { key: "followup",  label: "Follow Up",  instruction: "Write a friendly, personalized follow-up." },
  { key: "reengage",  label: "Re-engage",  instruction: "Write a gentle, empathetic message to re-engage an inactive client." },
  { key: "birthday",  label: "Birthday",   instruction: "Write a warm, personalized birthday greeting." },
  { key: "apology",   label: "Apology",    instruction: "Write a sincere apology for a mistake or bad experience." },
  { key: "upsell",    label: "Upsell",     instruction: "Write a thoughtful message recommending an additional service or product." },
];

export default function AiPromptsDashboard({
  leads = [],
  user = {},
  onSendAIPromptEmail, // optional override
}) {
  const [search, setSearch]           = useState("");
  const [focusedLead, setFocusedLead] = useState(null);
  const [responses, setResponses]     = useState({});
  const [loading, setLoading]         = useState({});
  const [notifStatus, setNotifStatus] = useState({});
  const [activeTab, setActiveTab]     = useState(PROMPT_TYPES[0].key);
  const [copied, setCopied]           = useState({});

  // helpers
  const getBrandName   = () => user.business || user.businessName || user.lineOfBusiness || "Your Business";
  const getBusinessType= () => user.businessType || "";
  const getUserName    = () => user.name || user.email?.split("@")[0] || "Your Team";
  const leadKey        = (l) => l?.id || l?._id || l?.email || l?.name || "";

  // filter leads
  const filteredLeads = useMemo(() => {
    const q = search.toLowerCase();
    return (leads || []).filter((l) => {
      const tags = Array.isArray(l.tags) ? l.tags : [];
      return (
        (l.name && l.name.toLowerCase().includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        tags.some((t) => String(t).toLowerCase().includes(q))
      );
    });
  }, [leads, search]);

  // generate AI
  const handleGenerate = async (lead, type) => {
    const key = leadKey(lead);
    if (!key) return;

    setLoading((m) => ({ ...m, [key]: true }));
    setResponses((r) => ({ ...r, [key]: { ...r[key], [type]: "" } }));

    const p = PROMPT_TYPES.find((pt) => pt.key === type) || {};
    try {
      const data = await api.post("/api/generate_prompt", {
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
        instruction:   p.instruction || "",
      });

      // Expecting { prompt: "..." }
      let out = (data?.prompt || data?.error || "").trim();
      // strip any "Subject:" lines if your model sometimes includes them
      out = out.replace(/^(?=.*subject:).*$/gim, "").trim();

      setResponses((r) => ({ ...r, [key]: { ...r[key], [type]: out } }));
    } catch (e) {
      setResponses((r) => ({ ...r, [key]: { ...r[key], [type]: e?.message || "AI error." } }));
    } finally {
      setLoading((m) => ({ ...m, [key]: false }));
    }
  };

  // send email/notification
  const handleSend = async (lead, message, type) => {
    const key = leadKey(lead);
    if (!message) return;

    if (typeof onSendAIPromptEmail === "function") {
      return onSendAIPromptEmail(lead, message, type);
    }

    setNotifStatus((s) => ({ ...s, [key]: "sending" }));
    const subject = `${getUserName()} at ${getBrandName()}`;
    try {
      await api.post("/api/send-ai-message", {
        leadEmail:    lead.email,
        userEmail:    user.email,
        message,
        subject,
        promptType:   type,
        leadName:     lead.name || "",
        userName:     getUserName(),
        businessName: getBrandName(),
      });
      setNotifStatus((s) => ({ ...s, [key]: "success" }));
    } catch {
      setNotifStatus((s) => ({ ...s, [key]: "error" }));
    } finally {
      setTimeout(() => setNotifStatus((s) => ({ ...s, [key]: undefined })), 2500);
    }
  };

  // copy
  const handleCopy = (lead, tab) => {
    const key = leadKey(lead);
    const text = responses[key]?.[tab];
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied((c) => ({ ...c, [`${key}-${tab}`]: true }));
    setTimeout(() => setCopied((c) => ({ ...c, [`${key}-${tab}`]: false })), 1200);
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
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="ai-grid">
            {filteredLeads.length === 0 ? (
              <div className="ai-grid-empty">No leads found. Try another search.</div>
            ) : (
              filteredLeads.map((lead) => (
                <div
                  key={leadKey(lead)}
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
                    {Array.isArray(lead.tags) && lead.tags.length
                      ? lead.tags.map((t) => (
                          <span key={t} className="tag">
                            {t}
                          </span>
                        ))
                      : "—"}
                  </div>
                  <div className="lead-notes">Notes: {lead.notes || "—"}</div>
                </div>
              ))
            )}
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
              {Array.isArray(focusedLead.tags) && focusedLead.tags.length
                ? focusedLead.tags.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))
                : "—"}
            </div>
            <div className="ai-detail-notes">Notes: {focusedLead.notes || "—"}</div>

            <div className="ai-tabs">
              {PROMPT_TYPES.map((pt) => (
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
              onClick={() => handleGenerate(focusedLead, activeTab)}
              disabled={!!loading[leadKey(focusedLead)]}
            >
              {loading[leadKey(focusedLead)]
                ? "Generating..."
                : `Generate ${PROMPT_TYPES.find((pt) => pt.key === activeTab)?.label} AI`}
            </button>

            {responses[leadKey(focusedLead)]?.[activeTab] && (
              <div className="ai-response">
                <strong>AI Suggestion:</strong>
                <p className="ai-response-text">
                  {responses[leadKey(focusedLead)][activeTab]}
                </p>
                <button
                  className="ai-response-copy"
                  onClick={() => handleCopy(focusedLead, activeTab)}
                >
                  {copied[`${leadKey(focusedLead)}-${activeTab}`] ? "Copied!" : "Copy"}
                </button>
                <button
                  className="ai-response-send"
                  onClick={() =>
                    handleSend(
                      focusedLead,
                      responses[leadKey(focusedLead)][activeTab],
                      activeTab
                    )
                  }
                  disabled={!!loading[leadKey(focusedLead)]}
                >
                  {notifStatus[leadKey(focusedLead)] === "sending"
                    ? "Sending..."
                    : notifStatus[leadKey(focusedLead)] === "success"
                    ? "Sent!"
                    : notifStatus[leadKey(focusedLead)] === "error"
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
