// File: src/components/Settings.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import GoogleCalendarEvents from "./GoogleCalendarEvents";
import StripeConnectCard from "./StripeConnectCard";
import { FaUser, FaPlug, FaQuestionCircle, FaUsers, FaSearch, FaTrash } from "react-icons/fa";
import { SiInstagram } from "react-icons/si";
import "./settings.css";

/* ---------- ENV & UTILS (CRA + Vite) ---------- */
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE) ||
  (typeof window !== "undefined" && window.location && window.location.hostname.includes("localhost")
    ? "http://localhost:5000"
    : "https://retainai-app.onrender.com");

const TABS = [
  { key: "profile",      label: "Profile",        icon: <FaUser /> },
  { key: "team",         label: "Team",           icon: <FaUsers /> },
  { key: "integrations", label: "Integrations",   icon: <FaPlug /> },
  { key: "help",         label: "Help & Support", icon: <FaQuestionCircle /> },
];

function safeParseJSON(res) {
  return res
    .text()
    .then((t) => (t ? JSON.parse(t) : {}))
    .catch(() => ({}));
}

/* ---------- MAIN ---------- */
export default function Settings({
  user,
  sidebarCollapsed,
  googleEvents,
  setGoogleEvents,
  gcalStatus,
  setGcalStatus,
  initialTab,
}) {
  const { search } = useLocation();
  const [tab, setTab] = useState(initialTab && TABS.some(t => t.key === initialTab) ? initialTab : "profile");
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", business: "", type: "", location: "", teamSize: "" });
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const initialFormRef = useRef(form);

  // keep tab in sync if prop changes later
  useEffect(() => {
    if (initialTab && TABS.some(t => t.key === initialTab)) setTab(initialTab);
  }, [initialTab]);

  // Load profile
  const loadProfile = () => {
    if (!user?.email) return;
    const ac = new AbortController();
    setError("");
    fetch(`${API_BASE}/api/user/${encodeURIComponent(user.email)}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await safeParseJSON(res);
        const next = {
          name: data.name || "",
          email: data.email || "",
          business: data.business || "",
          type: data.businessType || "",
          location: data.location || "",
          teamSize: data.people || "",
          logo: data.logo || ""
        };
        setProfile(data);
        setForm(next);
        initialFormRef.current = next;
        try { localStorage.setItem("user", JSON.stringify(data)); } catch {}
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError("Failed to load profile.");
      });
    return () => ac.abort();
  };
  useEffect(loadProfile, [user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh after Stripe connect redirects back
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("stripe_connected") === "1") loadProfile();
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => {
    const a = initialFormRef.current;
    const b = form;
    return (
      a.name !== b.name ||
      a.email !== b.email || // email is disabled; still compare for safety
      a.business !== b.business ||
      a.type !== b.type ||
      a.location !== b.location ||
      String(a.teamSize || "") !== String(b.teamSize || "")
    );
  }, [form]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      // Use existing backend profile save path you already have in place
      const res = await fetch(`${API_BASE}/api/oauth/google/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email, // immutable on UI but sent to backend
          name: form.name,
          logo: profile?.logo || "",
          businessType: form.type,
          businessName: form.business,
          people: form.teamSize,
          location: form.location,
        }),
      });
      const data = await safeParseJSON(res);
      if (!res.ok || !data.user) throw new Error(data.error || `HTTP ${res.status}`);
      await loadProfile();
      setEditMode(false);
    } catch (e) {
      setError(e.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const leftOffset = sidebarCollapsed ? 60 : 245;
  const settingsWidth = `calc(100vw - ${leftOffset}px)`;
  const MAX_W = 1000;

  if (!profile) {
    return (
      <div className="settings-layout" style={{ left: leftOffset, width: settingsWidth }}>
        <div className="settings-loading">Loading…</div>
      </div>
    );
  }

  return (
    <div className="settings-layout" style={{ left: leftOffset, width: settingsWidth }}>
      <nav className="settings-nav">
        {TABS.map(t => (
          <button
            key={t.key}
            className={tab === t.key ? "active" : ""}
            onClick={() => { setTab(t.key); setEditMode(false); setError(""); }}
            type="button"
          >
            <span className="settings-icon">{t.icon}</span>
            <span className="settings-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <main className="settings-content fade-in">
        {/* PROFILE */}
        {tab === "profile" && (
          <div className="profile-tab" style={{ maxWidth: MAX_W, margin: "0 auto" }}>
            <h2>Profile</h2>

            {error && (
              <div className="settings-alert settings-alert-error">
                {error}
              </div>
            )}

            <div className="profile-card">
              <div className="avatar" aria-label="Account logo">
                {profile.logo ? (
                  <img
                    src={profile.logo}
                    alt="logo"
                    onError={(e) => {
                      e.currentTarget.src = "";
                      e.currentTarget.alt = " ";
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  (profile.name?.[0]?.toUpperCase() || "?")
                )}
              </div>

              <div className="profile-fields">
                {[
                  { label: "Name",      name: "name"     },
                  { label: "Email",     name: "email"    },
                  { label: "Business",  name: "business" },
                  { label: "Type",      name: "type"     },
                  { label: "Location",  name: "location" },
                  { label: "Team Size", name: "teamSize" }
                ].map(({ label, name }) => (
                  <div key={name} className="field-row">
                    <div className="field-label">{label}</div>
                    {editMode ? (
                      <input
                        className="field-input"
                        type={name === "teamSize" ? "number" : "text"}
                        value={form[name]}
                        onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
                        disabled={name === "email"}
                      />
                    ) : (
                      <div className="field-value">{form[name] || "—"}</div>
                    )}
                  </div>
                ))}

                <div className="profile-actions">
                  {editMode ? (
                    <>
                      <button
                        className="btn btn-cancel"
                        onClick={() => { setEditMode(false); setForm(initialFormRef.current); setError(""); }}
                        disabled={saving}
                        type="button"
                      >
                        Cancel
                      </button>
                      <button
                        className="btn btn-save"
                        onClick={handleSave}
                        disabled={saving || !dirty}
                        type="button"
                        title={!dirty ? "No changes to save" : undefined}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-edit" onClick={() => setEditMode(true)} type="button">
                      Edit Profile
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TEAM */}
        {tab === "team" && (
          <TeamTab ownerEmail={profile.email} maxWidth={MAX_W} />
        )}

        {/* INTEGRATIONS */}
        {tab === "integrations" && (
          <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
            <h2>Integrations</h2>
            <div className="integration-row" style={{ justifyContent: "center" }}>
              <div className="integration-card">
                <GoogleCalendarEvents
                  user={profile}
                  onStatus={setGcalStatus}
                  onEvents={setGoogleEvents}
                />
              </div>

              <StripeConnectCard user={profile} refreshUser={loadProfile} />

              <div className="integration-card coming-soon">
                <SiInstagram className="integration-icon instagram" />
                <div>
                  <div className="integration-title">Instagram</div>
                  <div className="integration-desc">Coming soon!</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* HELP */}
        {tab === "help" && (
          <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
            <h2>Help & Support</h2>
            <p className="help-line">
              If you need anything, email{" "}
              <a href="mailto:owner@retainai.ca">owner@retainai.ca</a> or see our{" "}
              <a href="https://docs.retainai.ca" target="_blank" rel="noreferrer">
                documentation
              </a>.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Team tab (centered list management; no invite UI)               */
/* ─────────────────────────────────────────────────────────────── */
function TeamTab({ ownerEmail, maxWidth }) {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyEmail, setBusyEmail] = useState("");
  const [error, setError] = useState("");

  const roles = ["owner", "manager", "member"];

  const loadMembers = async () => {
    if (!ownerEmail) return;
    setLoading(true);
    setError("");
    const ac = new AbortController();
    try {
      const res = await fetch(`${API_BASE}/api/team/members`, {
        headers: { "X-User-Email": ownerEmail },
        signal: ac.signal,
      });
      const data = await safeParseJSON(res);
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMembers(Array.isArray(data.members) ? data.members : []);
    } catch (e) {
      if (e.name !== "AbortError") {
        setError("Failed to load team members.");
        setMembers([]);
      }
    } finally {
      setLoading(false);
    }
    return () => ac.abort();
  };

  useEffect(() => { loadMembers(); /* eslint-disable-next-line */ }, [ownerEmail]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m =>
      (m.name || "").toLowerCase().includes(q) ||
      (m.email || "").toLowerCase().includes(q) ||
      (m.role || "").toLowerCase().includes(q)
    );
  }, [members, search]);

  const changeRole = async (email, role) => {
    setBusyEmail(email);
    setError("");
    const prev = members;
    setMembers(ms => ms.map(m => (m.email === email ? { ...m, role } : m)));
    try {
      const res = await fetch(`${API_BASE}/api/team/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Email": ownerEmail },
        body: JSON.stringify({ email, role })
      });
      if (!res.ok) throw new Error("Role update failed");
    } catch (e) {
      setError("Could not change role. Ensure /api/team/role exists on backend.");
      setMembers(prev);
    } finally {
      setBusyEmail("");
    }
  };

  const removeMember = async (email) => {
    if (!window.confirm("Remove this member?")) return;
    setBusyEmail(email);
    setError("");
    const prev = members;
    setMembers(ms => ms.filter(m => m.email !== email));
    try {
      const res = await fetch(`${API_BASE}/api/team/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Email": ownerEmail },
        body: JSON.stringify({ email })
      });
      if (!res.ok) throw new Error("Remove failed");
    } catch (e) {
      setError("Could not remove. Ensure /api/team/remove exists on backend.");
      setMembers(prev);
    } finally {
      setBusyEmail("");
    }
  };

  return (
    <div>
      <h2 style={{ maxWidth: maxWidth, margin: "0 auto 14px" }}>Team</h2>

      {/* Search + refresh */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          margin: "0 auto 14px",
          maxWidth: maxWidth,
          width: "100%"
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "#232325", borderRadius: 10,
            padding: "10px 12px", border: "1px solid #2c2c2f", flex: 1
          }}
        >
          <FaSearch style={{ color: "#aaa" }} />
          <input
            placeholder="Search by name, email, or role…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: "transparent", border: "none", outline: "none", color: "#fff", width: "100%" }}
          />
        </div>
        <button
          className="btn"
          onClick={loadMembers}
          style={{ background: "#232323", color: "#fff", border: "1px solid #444" }}
          type="button"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="settings-alert settings-alert-error" style={{ maxWidth: maxWidth, margin: "0 auto 12px" }}>
          {error}
        </div>
      )}

      {/* Members table */}
      <div
        style={{
          background: "#232325",
          borderRadius: 12,
          padding: 0,
          overflow: "hidden",
          boxShadow: "0 2px 12px #0002",
          maxWidth: maxWidth,
          width: "100%",
          margin: "0 auto"
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 2fr 1.2fr 1.2fr 0.8fr",
            gap: 8,
            padding: "14px 16px",
            background: "#1f1f23",
            color: "#bbb",
            fontWeight: 800
          }}
        >
          <div>Name</div>
          <div>Email</div>
          <div>Role</div>
          <div>Last login</div>
          <div style={{ textAlign: "right" }}>Actions</div>
        </div>

        {loading ? (
          <div style={{ padding: 18, color: "#ddd" }}>Loading members…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 18, color: "#bbb" }}>No members found.</div>
        ) : (
          filtered.map(m => (
            <div
              key={m.email}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 2fr 1.2fr 1.2fr 0.8fr",
                gap: 8,
                padding: "14px 16px",
                borderTop: "1px solid #2b2b2f",
                alignItems: "center"
              }}
            >
              <div style={{ color: "#fff", fontWeight: 700 }}>{m.name || "—"}</div>
              <div style={{ color: "#ddd" }}>{m.email}</div>
              <div>
                <select
                  disabled={busyEmail === m.email || m.email === ownerEmail}
                  value={m.role || "member"}
                  onChange={e => changeRole(m.email, e.target.value)}
                  style={{
                    background: "#18181b",
                    color: "#fff",
                    border: "1px solid #333",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontWeight: 700,
                    minWidth: 120
                  }}
                >
                  {roles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ color: "#bbb" }}>
                {m.last_login ? new Date(m.last_login).toLocaleString() : "—"}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  className="btn"
                  title="Remove"
                  disabled={busyEmail === m.email || m.email === ownerEmail}
                  onClick={() => removeMember(m.email)}
                  style={{
                    background: "#2a2a2a",
                    color: "#fff",
                    border: "1px solid #3a3a3a",
                    display: "flex",
                    alignItems: "center",
                    gap: 8
                  }}
                  type="button"
                >
                  <FaTrash />
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
