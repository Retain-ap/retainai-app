// File: src/components/Sidebar.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
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
import { promptInstall, canPromptInstall } from "../index"; // relies on your PWA helpers

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

  // SSR-safe env checks
  const [installReady, setInstallReady] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isiOS, setIsiOS] = useState(false);

  // compute at runtime (no window access during SSR)
  useEffect(() => {
    try {
      setInstallReady(Boolean(canPromptInstall?.()));
    } catch {}
    try {
      const standalone =
        window.matchMedia?.("(display-mode: standalone)")?.matches ||
        window.navigator.standalone === true;
      setIsStandalone(Boolean(standalone));
    } catch {}
    try {
      setIsiOS(/iphone|ipad|ipod/i.test(navigator.userAgent));
    } catch {}
  }, []);

  // listen for install-available event broadcast by your index.js
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

  // close profile card on outside click / Esc
  const cardRef = useRef(null);
  useEffect(() => {
    if (!profileOpen) return;
    const handleDocClick = (e) => {
      if (cardRef.current && !cardRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    const handleEsc = (e) => {
      if (e.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("mousedown", handleDocClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleDocClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [profileOpen]);

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
      if (!canPromptInstall?.()) {
        alert("Install prompt isn’t available yet. Refresh once, then try again.");
        return;
      }
      try {
        const { outcome } = await promptInstall();
        if (outcome === "accepted") {
          // Optional: toast/log
        }
      } catch (err) {
        console.warn("[PWA] install prompt error:", err);
      }
    },
    [isStandalone, isiOS]
  );

  const userLogo = user?.logo || logo || defaultAvatar;
  const initials =
    (user?.name &&
      user.name
        .split(" ")
        .filter(Boolean)
        .map((w) => w[0])
        .join("")
        .toUpperCase()) ||
    (user?.email ? user.email[0].toUpperCase() : "U");

  const displayName =
    user?.name && user.name.trim() !== "" ? user.name : user?.email;

  const brand =
    user?.business || user?.businessName || user?.lineOfBusiness || "Your Business";
  const businessType = (user?.businessType || "").trim();
  const role =
    (user?.role && String(user.role)) ||
    (user?.invited_by || user?.invitedBy || user?.created_by ? "Team member" : "Owner");

  // nav helper
  const NavBtn = ({ target, icon, label }) => (
    <button
      type="button"
      className={section === target ? "active" : ""}
      onClick={() => setSection(target)}
      aria-current={section === target ? "page" : undefined}
      aria-label={label}
    >
      {icon} {!collapsed && label}
    </button>
  );

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

      {/* Profile header */}
      <div
        className="sidebar-profile"
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={profileOpen}
        onClick={() => setProfileOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setProfileOpen((o) => !o);
          }
        }}
      >
        {userLogo ? (
          <img
            src={userLogo}
            alt="Profile"
            className="sidebar-avatar"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = defaultAvatar;
            }}
          />
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
            ref={cardRef}
            className="sidebar-dropdown-card"
            role="dialog"
            aria-label="Profile menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dropdown-header">
              <div className="dropdown-title">{displayName}</div>
              <div className="dropdown-email">{user?.email}</div>
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
              <span className="dropdown-value">{businessType || "Not set"} </span>
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
      <nav className="sidebar-nav" aria-label="Primary">
        <NavBtn target="dashboard" icon={<FaUsers />} label="Dashboard" />
        <NavBtn target="analytics" icon={<FaChartBar />} label="Analytics" />
        <NavBtn target="calendar" icon={<FaCalendarAlt />} label="Calendar" />
        <NavBtn target="messages" icon={<FaEnvelopeOpenText />} label="Messages" />
        <NavBtn target="notifications" icon={<FaBell />} label="Notifications" />
        <NavBtn target="automations" icon={<FaRobot />} label="Automations" />
        <NavBtn target="ai-prompts" icon={<FaRobot />} label="AI Prompts" />
        <NavBtn
          target="invoices"
          icon={<FaFileInvoiceDollar />}
          label="Invoices"
        />
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
