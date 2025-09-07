// src/components/LeadsDashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import LeadDrawer from "./LeadDrawer";

/**
 * Upgrades in this version:
 * - Fix: Import button now calls onImportLeads (opens the CSV/Imports tab) instead of a Google OAuth URL.
 * - Fast search with debouncing + tag & status filters + sorting.
 * - Quick stats (Active / Follow Up / Overdue) and unique tag chips.
 * - Keyboard nav: ↑/↓ to move, Enter to open drawer, Esc to close drawer.
 * - Polished empty/loading states and subtle row highlighting.
 */

export default function LeadsDashboard({
  leads,
  loading,
  onAddLead,
  onEditLead,
  onDeleteLead,
  user,
  drawerLead,
  setDrawerLead,
  onContactedLead,
  onImportLeads, // 👈 NEW: wired to Settings "Imports" tab in CrmDashboard
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); // all | active | warning | cold
  const [sortBy, setSortBy] = useState("recent"); // recent | name | status
  const [focusIndex, setFocusIndex] = useState(-1);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 180);
    return () => clearTimeout(t);
  }, [search]);

  // Theme
  const UI = {
    BG: "#181a1b",
    INPUT: "#232323",
    BORDER: "#2b2b2f",
    TEXT: "#e9edef",
    SUB: "#9aa4ad",
    ACCENT: "#38ff98",
    BADGE_COLD: "#e66565",
    BADGE_WARN: "#f7cb53",
    BADGE_OK: "#1bc982",
    HOVER: "#242428",
    ROW: "#1c1d1f",
    CARD: "#2a2a2e",
  };

  // Unique tags + status counts
  const { allTags, counts } = useMemo(() => {
    const tagSet = new Set();
    const c = { active: 0, warning: 0, cold: 0 };
    (leads || []).forEach((l) => {
      (l.tags || []).forEach((t) => t && tagSet.add(String(t)));
      const s = l.status || "active";
      if (s === "cold") c.cold++;
      else if (s === "warning") c.warning++;
      else c.active++;
    });
    return { allTags: ["all", ...Array.from(tagSet)], counts: c };
  }, [leads]);

  // Filter + sort
  const filteredLeads = useMemo(() => {
    let arr = Array.isArray(leads) ? leads.slice() : [];

    if (debounced) {
      arr = arr.filter((l) =>
        [l.name, l.email, ...(l.tags || [])]
          .join(" ")
          .toLowerCase()
          .includes(debounced)
      );
    }

    if (selectedTag !== "all") {
      arr = arr.filter((l) => (l.tags || []).includes(selectedTag));
    }

    if (statusFilter !== "all") {
      arr = arr.filter((l) => (l.status || "active") === statusFilter);
    }

    // sort
    arr.sort((a, b) => {
      if (sortBy === "name") {
        return String(a.name || a.email || "").localeCompare(
          String(b.name || b.email || "")
        );
      }
      if (sortBy === "status") {
        const rank = (s) =>
          s === "cold" ? 0 : s === "warning" ? 1 : 2; // cold first
        return rank(a.status || "active") - rank(b.status || "active");
      }
      // recent (createdAt or updatedAt or last_contacted)
      const ta =
        Date.parse(a.updatedAt || a.last_contacted || a.createdAt || 0) || 0;
      const tb =
        Date.parse(b.updatedAt || b.last_contacted || b.createdAt || 0) || 0;
      return tb - ta;
    });

    return arr;
  }, [leads, debounced, selectedTag, statusFilter, sortBy]);

  // Keep focusIndex within bounds on list changes
  useEffect(() => {
    if (focusIndex >= filteredLeads.length) setFocusIndex(filteredLeads.length - 1);
  }, [filteredLeads.length, focusIndex]);

  // Keyboard nav
  const rootRef = useRef(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKey = (e) => {
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((i) => Math.min((i < 0 ? -1 : i) + 1, filteredLeads.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        if (focusIndex >= 0 && focusIndex < filteredLeads.length) {
          setDrawerLead?.(filteredLeads[focusIndex]);
        }
      } else if (e.key === "Escape") {
        if (drawerLead) setDrawerLead?.(null);
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [drawerLead, filteredLeads, focusIndex, setDrawerLead]);

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

  // Import → open Imports tab (CSV, then Google Contacts soon)
  function handleImportClick() {
    if (typeof onImportLeads === "function") {
      onImportLeads();
      return;
    }
    // fallback if prop not provided
    if (window?.RetainAI?.openImports) {
      window.RetainAI.openImports();
      return;
    }
    // last-resort: route to settings
    window.location.href = "/app/settings#imports";
  }

  // Helpers
  const statusBadge = (s) =>
    s === "cold" ? "Overdue" : s === "warning" ? "Follow Up" : "Active";
  const statusColor = (s) =>
    s === "cold" ? UI.BADGE_COLD : s === "warning" ? UI.BADGE_WARN : UI.BADGE_OK;

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      style={{ width: "100%", minHeight: "100vh", outline: "none" }}
    >
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
          placeholder="Search by name, email, tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            style={actionBtnStyle}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3a3a3a")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2e2e2e")}
            onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(1px)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
            onClick={handleImportClick}
            type="button"
            title="Import contacts (CSV, then Google)"
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

      {/* Filters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 16,
          padding: "12px 0 10px 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Status filter */}
          {[
            ["all", `All (${(leads || []).length})`],
            ["active", `Active (${counts.active})`],
            ["warning", `Follow Up (${counts.warning})`],
            ["cold", `Overdue (${counts.cold})`],
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              style={{
                background: statusFilter === val ? "#232323" : "transparent",
                border: `1px solid ${UI.BORDER}`,
                color: statusFilter === val ? UI.TEXT : UI.SUB,
                borderRadius: 999,
                padding: "6px 10px",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sort + Tag */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            title="Filter by tag"
            style={{
              background: "#1c1d1f",
              color: UI.TEXT,
              border: `1px solid ${UI.BORDER}`,
              borderRadius: 10,
              padding: "8px 12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t === "all" ? "All Tags" : t}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            title="Sort"
            style={{
              background: "#1c1d1f",
              color: UI.TEXT,
              border: `1px solid ${UI.BORDER}`,
              borderRadius: 10,
              padding: "8px 12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <option value="recent">Newest</option>
            <option value="name">Name</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      {/* Lead list */}
      <div style={{ width: "100%" }}>
        {loading && (
          <div style={{ color: UI.SUB, padding: 28, textAlign: "center" }}>
            Loading leads…
            <div
              style={{
                marginTop: 14,
                display: "grid",
                gap: 8,
              }}
            >
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 54,
                    background: UI.ROW,
                    borderRadius: 10,
                    border: `1px solid ${UI.BORDER}`,
                    opacity: 0.7,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {!loading && filteredLeads.length === 0 && (
          <div
            style={{
              color: UI.SUB,
              padding: 28,
              textAlign: "center",
              border: `1px dashed ${UI.BORDER}`,
              borderRadius: 12,
              background: "#151618",
            }}
          >
            <div style={{ fontWeight: 800, color: UI.TEXT, marginBottom: 6 }}>
              No leads match your filters
            </div>
            <div style={{ marginBottom: 12 }}>
              Try clearing search/filters or add/import leads.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button style={actionBtnStyle} onClick={() => setSearch("")}>
                Clear Search
              </button>
              <button style={actionBtnStyle} onClick={onAddLead}>
                + Add Lead
              </button>
              <button style={actionBtnStyle} onClick={handleImportClick}>
                Import
              </button>
            </div>
          </div>
        )}

        {!loading &&
          filteredLeads.map((lead, idx) => {
            const active = drawerLead?.id === lead.id;
            const isFocused = idx === focusIndex;

            return (
              <div
                key={lead.id}
                onClick={() => setDrawerLead(lead)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "14px 16px",
                  borderBottom: `1px solid ${UI.BORDER}`,
                  background: active || isFocused ? UI.HOVER : "transparent",
                  cursor: "pointer",
                  transition: "background .12s ease",
                  outline: isFocused ? `2px solid ${UI.ACCENT}40` : "none",
                  outlineOffset: 0,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = UI.HOVER)}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background =
                    active || isFocused ? UI.HOVER : "transparent")
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

                {/* Name + email + tags */}
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
                  {!!(lead.tags || []).length && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      {(lead.tags || []).slice(0, 5).map((t) => (
                        <span
                          key={t}
                          style={{
                            background: "#212224",
                            border: `1px solid ${UI.BORDER}`,
                            borderRadius: 999,
                            color: UI.SUB,
                            padding: "2px 8px",
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: status + quick action */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      background: statusColor(lead.status),
                      color: "#1b1b1b",
                      fontWeight: 900,
                      fontSize: 13,
                      borderRadius: 999,
                      padding: "6px 14px",
                      minWidth: 92,
                      textAlign: "center",
                    }}
                  >
                    {statusBadge(lead.status)}
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
                        onContactedLead?.(lead);
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
            onEditLead?.(drawerLead);
          }}
          onDelete={() => {
            setDrawerLead(null);
            onDeleteLead?.(drawerLead.id);
          }}
          onContacted={() => {
            setDrawerLead(null);
            onContactedLead?.(drawerLead);
          }}
          user={user}
        />
      )}
    </div>
  );
}
