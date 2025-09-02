// src/components/LeadCard.jsx
import React from "react";
import "./LeadCard.css";

export default function LeadCard({ lead, onClick, onContacted }) {
  return (
    <div className="lead-card folk-style" onClick={onClick}>
      <div className="lead-avatar">
        {lead.name?.slice(0, 2).toUpperCase() || lead.email?.slice(0, 2).toUpperCase() || "?"}
      </div>
      <div className="lead-info">
        <div className="lead-name-row">
          <span className="lead-name">{lead.name || lead.email}</span>
          {lead.status && (
            <>
              <span
                className="lead-status"
                style={{
                  background: lead.status_color || "#aaa",
                  color: "#232323",
                  marginLeft: 7,
                  textTransform: "capitalize"
                }}
                title={
                  lead.status === "cold"
                    ? "Overdue for follow-up"
                    : lead.status === "warning"
                    ? "Time to follow up"
                    : "Active and up to date"
                }
              >
                {lead.status === "cold"
                  ? "Overdue"
                  : lead.status === "warning"
                  ? "Follow Up"
                  : "Active"}
              </span>
              {(lead.status === "cold" || lead.status === "warning") && (
                <button
                  className="contacted-btn"
                  style={{ marginLeft: 9 }}
                  onClick={e => {
                    e.stopPropagation();
                    onContacted?.(lead);
                  }}
                >
                  Lead Contacted
                </button>
              )}
            </>
          )}
        </div>
        <div className="lead-meta">
          {lead.tags?.map(tag => (
            <span key={tag} className="lead-tag">
              {tag}
            </span>
          ))}
        </div>
        <div className="lead-notes" style={{ color: "#888" }}>
          {lead.notes
            ? lead.notes.length > 80
              ? lead.notes.slice(0, 80) + "…"
              : lead.notes
            : "No notes yet"}
        </div>
      </div>
    </div>
  );
}
