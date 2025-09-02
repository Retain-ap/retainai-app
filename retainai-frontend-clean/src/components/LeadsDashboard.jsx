// src/components/LeadsDashboard.jsx
import React, { useMemo, useState } from "react";
import LeadDrawer from "./LeadDrawer";

export default function LeadsDashboard({
  leads,
  loading,
  onAddLead,
  onEditLead,
  onDeleteLead,
  user,
  drawerLead,
  setDrawerLead,
  onContactedLead
}) {
  const [search, setSearch] = useState("");

  // --- THEME ---
  const UI = {
    BG: "#181a1b",
    PANEL: "#202022",
    INPUT: "#232323",
    CARD: "#2a2a2e",
    BORDER: "#2b2b2f",
    TEXT: "#e9edef",
    SUB: "#9aa4ad",
    ACCENT: "#38ff98",
    BADGE_COLD: "#e66565",
    BADGE_WARN: "#f7cb53",
    BADGE_OK: "#1bc982",
    HOVER: "#242428",
  };

  // Filtered leads
  const filteredLeads = useMemo(() => {
    if (!search) return leads;
    const q = search.toLowerCase();
    return leads.filter((lead) =>
      [lead.name, lead.email, ...(lead.tags || [])]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [leads, search]);

  // --- Action Button Style ---
  const actionBtnStyle = {
    background: "#282828",
    color: UI.TEXT,
    border: "1px solid #2e2e2e",
    borderRadius: 10,
    padding: "12px 28px",
    fontWeight: 800,
    fontSize: 16,
    cursor: "pointer",
    transition: "transform .05s ease, background .15s ease, border-color .15s ease",
  };

  function handleImportLeads() {
    const u = user || JSON.parse(localStorage.getItem("user") || "null");
    const email = u?.email || "";
    const redirectBack = `${window.location.origin}/app`;
    const API_BASE = process.env.REACT_APP_API_URL || "";
    const base = API_BASE ? `${API_BASE}` : "";
    const url = `${base}/api/google/authorize?userEmail=${encodeURIComponent(
      email
    )}&redirect=${encodeURIComponent(redirectBack)}`;
    window.location.href = url;
  }

  return (
    <div style={{ width: "100%", minHeight: "100vh", position: "relative", background: "transparent" }}>
      {/* Top bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 20,
          padding: "0 0 18px 0",
          borderBottom: `1px solid ${UI.BORDER}`,
        }}
      >
        <input
          style={{
            background: UI.INPUT,
            color: UI.TEXT,
            border: `1px solid ${UI.BORDER}`,
            borderRadius: 12,
            fontSize: 16,
            padding: "12px 18px",
            width: "100%",
            outline: "none",
            boxSizing: "border-box",
          }}
          placeholder="Search by name, email, tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div style={{ display: "flex", gap: 10 }}>
          <button
            style={actionBtnStyle}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3a3a3a")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2e2e2e")}
            onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(1px)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
            onClick={handleImportLeads}
            type="button"
            title="Import from Google Contacts"
          >
            Import Leads
          </button>

          <button
            style={actionBtnStyle}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3a3a3a")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2e2e2e")}
            onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(1px)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
            onClick={onAddLead}
            type="button"
          >
            + Add Lead
          </button>
        </div>
      </div>

      {/* Lead list */}
      <div style={{ width: "100%", marginTop: 0 }}>
        {loading && (
          <div style={{ color: UI.SUB, padding: 28, textAlign: "center" }}>
            Loading leads...
          </div>
        )}

        {!loading && filteredLeads.length === 0 && (
          <div style={{ color: UI.SUB, padding: 28, textAlign: "center" }}>
            No leads found.
          </div>
        )}

        {!loading &&
          filteredLeads.map((lead) => {
            // ✅ FIX: Compare IDs, not objects
            const active = drawerLead?.id === lead.id;

            const badgeColor =
              lead.status === "cold"
                ? UI.BADGE_COLD
                : lead.status === "warning"
                ? UI.BADGE_WARN
                : UI.BADGE_OK;

            return (
              <div
                key={lead.id}
                onClick={() => setDrawerLead(lead)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "14px 16px",
                  borderBottom: `1px solid ${UI.BORDER}`,
                  background: active ? UI.HOVER : "transparent",
                  cursor: "pointer",
                  transition: "background .12s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = UI.HOVER)}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = active ? UI.HOVER : "transparent")
                }
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 42,
                    height: 42,
                    background: UI.CARD,
                    border: `1px solid ${UI.BORDER}`,
                    borderRadius: 12,
                    fontWeight: 900,
                    color: "#c6cbd0",
                    fontSize: 16,
                    display: "grid",
                    placeItems: "center",
                    marginRight: 14,
                  }}
                >
                  {(lead.name || lead.email || "??").slice(0, 2).toUpperCase()}
                </div>

                {/* Name + email */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      color: UI.TEXT,
                      fontWeight: 800,
                      fontSize: 16,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {lead.name || lead.email}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: UI.SUB,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      marginTop: 2,
                    }}
                  >
                    {lead.email}
                  </div>
                </div>

                {/* Right: status + quick action */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      background: badgeColor,
                      color: "#1b1b1b",
                      fontWeight: 900,
                      fontSize: 13,
                      borderRadius: 999,
                      padding: "6px 14px",
                      minWidth: 82,
                      textAlign: "center",
                    }}
                  >
                    {lead.status === "cold"
                      ? "Overdue"
                      : lead.status === "warning"
                      ? "Follow Up"
                      : "Active"}
                  </div>

                  {(lead.status === "cold" || lead.status === "warning") && (
                    <button
                      style={{
                        background: UI.ACCENT,
                        color: "#132218",
                        fontWeight: 900,
                        border: "none",
                        borderRadius: 999,
                        padding: "6px 12px",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onContactedLead) onContactedLead(lead);
                      }}
                      title="Mark this lead as contacted"
                    >
                      Lead Contacted
                    </button>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {/* Drawer */}
      {drawerLead && (
        <LeadDrawer
          lead={drawerLead}
          onClose={() => setDrawerLead(null)}
          onEdit={() => {
            setDrawerLead(null);
            onEditLead(drawerLead);
          }}
          onDelete={() => {
            setDrawerLead(null);
            onDeleteLead(drawerLead.id);
          }}
          onContacted={() => {
            setDrawerLead(null);
            if (onContactedLead) onContactedLead(drawerLead);
          }}
          user={user}
        />
      )}
    </div>
  );
}
