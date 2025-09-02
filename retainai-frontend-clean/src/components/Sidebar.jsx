// src/components/Sidebar.jsx
import React, { useEffect, useState, useCallback } from "react";
import "./Sidebar.css";
import {
  FaCalendarAlt,
  FaEnvelopeOpenText,
  FaBell,
  FaUsers,
  FaChartBar,
  FaChevronLeft,
  FaChevronRight,
  FaRobot,
  FaDesktop,
  FaCog,
  FaFileInvoiceDollar,
  FaUserPlus,
} from "react-icons/fa";
import defaultAvatar from "../assets/default-avatar.png";
import { promptInstall, canPromptInstall } from "../index"; // <- use helpers

export default function Sidebar({
  logo,
  onLogout,
  user,
  setSection,
  section,
  collapsed,
  setCollapsed,
  onInviteTeam,
  onImportLeads,
}) {
  const [profileOpen, setProfileOpen] = useState(false);

  // Detect PWA state & listen for install-available event from index.js
  const [installReady, setInstallReady] = useState(canPromptInstall());
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true;
  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onAvail = () => setInstallReady(true);
    const onInstalled = () => setInstallReady(false);
    window.addEventListener("pwa-install-available", onAvail);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("pwa-install-available", onAvail);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleAddToDesktop = useCallback(
    async (e) => {
      e.stopPropagation();

      if (isStandalone) {
        alert("RetainAI is already installed.");
        return;
      }
      if (isiOS) {
        alert("On iOS: open in Safari, then Share → Add to Home Screen.");
        return;
      }
      if (!canPromptInstall()) {
        alert("Install prompt isn’t available yet. Refresh once, then try again.");
        return;
      }
      try {
        const { outcome } = await promptInstall(); // "accepted" | "dismissed"
        if (outcome === "accepted") {
          // optional toast/log
        }
      } catch (err) {
        console.warn("[PWA] install prompt error:", err);
      }
    },
    [isStandalone, isiOS]
  );

  const userLogo = user?.logo || logo || defaultAvatar;
  const initials = user?.name
    ? user.name
        .split(" ")
        .filter(Boolean)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : user?.email
    ? user.email[0].toUpperCase()
    : "U";

  const displayName =
    user?.name && user.name.trim() !== "" ? user.name : user?.email;

  // ----- NEW: brand, type, and role logic -----
  const brand =
    user?.business || user?.businessName || user?.lineOfBusiness || "Your Business";
  const businessType = (user?.businessType || "").trim();

  // If user.role is set, use it. Otherwise:
  // - Owner if not invited (first/solo account)
  // - Team member if invited_by/created_by exists
  const role =
    (user?.role && String(user.role)) ||
    (user?.invited_by || user?.invitedBy || user?.created_by ? "Team member" : "Owner");
  // --------------------------------------------

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <button
        type="button"
        className="sidebar-toggle"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? "Open sidebar" : "Close sidebar"}
      >
        {collapsed ? <FaChevronRight /> : <FaChevronLeft />}
      </button>

      <div
        className="sidebar-profile"
        onClick={() => setProfileOpen((o) => !o)}
      >
        {userLogo ? (
          <img src={userLogo} alt="Profile" className="sidebar-avatar" />
        ) : (
          <div className="sidebar-avatar-initials" aria-hidden>
            {initials}
          </div>
        )}
        {!collapsed && (
          <div className="sidebar-profile-info">
            <div className="sidebar-profile-name">{displayName}</div>
            {user?.name && user.name.trim() !== "" && (
              <div className="sidebar-profile-email">{user?.email}</div>
            )}
          </div>
        )}

        {profileOpen && !collapsed && (
          <div
            className="sidebar-dropdown-card"
            role="dialog"
            onClick={(e) => e.stopPropagation()} // keep it open while clicking inside
          >
            <div className="dropdown-header">
              <div className="dropdown-title">{displayName}</div>
              <div className="dropdown-email">{user?.email}</div>
              {/* Brand + type shown in header for quick context */}
              <div className="dropdown-brand">
                {brand}
                {businessType ? ` — ${businessType}` : ""}
              </div>
            </div>

            <div className="dropdown-row">
              <span className="dropdown-label">Role</span>
              <span className="dropdown-value">{role}</span>
            </div>
            <div className="dropdown-row">
              <span className="dropdown-label">Business</span>
              <span className="dropdown-value">
                {businessType || "Not set"}
              </span>
            </div>

            <button
              type="button"
              className="dropdown-btn"
              onClick={handleAddToDesktop}
              disabled={!installReady && !isiOS && !isStandalone}
              title={
                isStandalone
                  ? "Already installed"
                  : isiOS
                  ? "iOS: Share → Add to Home Screen"
                  : installReady
                  ? "Install RetainAI"
                  : "Prompt not ready yet"
              }
            >
              <FaDesktop style={{ marginRight: 7, fontSize: 17 }} />
              {isStandalone ? "Installed" : "Add to desktop"}
            </button>

            <button type="button" className="dropdown-btn logout" onClick={onLogout}>
              Log out
            </button>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        <button
          type="button"
          className={section === "dashboard" ? "active" : ""}
          onClick={() => setSection("dashboard")}
        >
          <FaUsers /> {!collapsed && "Dashboard"}
        </button>
        <button
          type="button"
          className={section === "analytics" ? "active" : ""}
          onClick={() => setSection("analytics")}
        >
          <FaChartBar /> {!collapsed && "Analytics"}
        </button>
        <button
          type="button"
          className={section === "calendar" ? "active" : ""}
          onClick={() => setSection("calendar")}
        >
          <FaCalendarAlt /> {!collapsed && "Calendar"}
        </button>
        <button
          type="button"
          className={section === "messages" ? "active" : ""}
          onClick={() => setSection("messages")}
        >
          <FaEnvelopeOpenText /> {!collapsed && "Messages"}
        </button>
        <button
          type="button"
          className={section === "notifications" ? "active" : ""}
          onClick={() => setSection("notifications")}
        >
          <FaBell /> {!collapsed && "Notifications"}
        </button>
        <button
          type="button"
          className={section === "automations" ? "active" : ""}
          onClick={() => setSection("automations")}
        >
          <FaRobot /> {!collapsed && "Automations"}
        </button>
        <button
          type="button"
          className={section === "ai-prompts" ? "active" : ""}
          onClick={() => setSection("ai-prompts")}
        >
          <FaRobot /> {!collapsed && "AI Prompts"}
        </button>
        <button
          type="button"
          className={section === "invoices" ? "active" : ""}
          onClick={() => setSection("invoices")}
        >
          <FaFileInvoiceDollar /> {!collapsed && "Invoices"}
        </button>
      </nav>

      {/* Invite Team */}
      {!collapsed && (
        <button
          type="button"
          className="sidebar-invite-btn"
          onClick={() => {
            if (typeof onInviteTeam === "function") onInviteTeam();
            else setSection("settings");
          }}
          aria-label="Invite team members"
          title="Invite team members"
        >
          <FaUserPlus style={{ marginRight: 9, fontSize: 18 }} />
          Invite Team
        </button>
      )}

      {/* Settings */}
      {!collapsed && (
        <button
          type="button"
          className="sidebar-settings-btn"
          onClick={() => setSection("settings")}
        >
          <FaCog style={{ marginRight: 9, fontSize: 18 }} />
          Settings
        </button>
      )}
    </aside>
  );
}
