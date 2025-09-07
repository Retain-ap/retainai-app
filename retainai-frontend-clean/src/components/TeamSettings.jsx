// src/components/TeamSettings.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

// ---- API base (CRA + Vite safe) ----
const API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_BASE) ||
  (typeof window !== "undefined" &&
  window.location &&
  window.location.hostname.includes("localhost")
    ? "http://localhost:5000"
    : "https://retainai-app.onrender.com");

export default function TeamSettings({ user }) {
  const apiBase = API_BASE;

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingInvite, setLoadingInvite] = useState(false);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [inviteLink, setInviteLink] = useState(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const abortRef = useRef(null);

  const userEmail = user?.email || "";

  const canInvite = useMemo(() => {
    const e = email.trim();
    const validEmail = /^\S+@\S+\.\S+$/.test(e);
    const validRole = role === "member" || role === "owner"; // keep your roles
    return !!userEmail && validEmail && validRole && !loadingInvite;
  }, [email, role, userEmail, loadingInvite]);

  const formatLastLogin = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
  };

  const safeJson = async (res) => {
    try { return await res.json(); } catch { return {}; }
  };

  const loadMembers = useCallback(async () => {
    if (!userEmail) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch(`${apiBase}/api/team/members`, {
        headers: { "X-User-Email": userEmail },
        signal: controller.signal,
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || `Failed to load members (${res.status})`);
      setMembers(Array.isArray(data.members) ? data.members : []);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message || "Could not load members.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, userEmail]);

  useEffect(() => {
    loadMembers();
    return () => abortRef.current?.abort();
  }, [loadMembers]);

  const copyInvite = async () => {
    if (!inviteLink) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteLink);
      } else {
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = inviteLink;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setNotice("Invite link copied to clipboard.");
      setTimeout(() => setNotice(""), 2000);
    } catch {
      setError("Could not copy link.");
    }
  };

  const invite = async () => {
    if (!canInvite) return;
    setLoadingInvite(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch(`${apiBase}/api/team/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Email": userEmail,
        },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || `Invite failed (${res.status})`);

      if (data.accept_url) {
        setInviteLink(data.accept_url);
        setNotice("Invite created. Share the link below.");
      } else {
        setInviteLink(null);
        setNotice("Invite created.");
      }

      setEmail("");
      // Optional refresh if backend reflects pending invites in members
      loadMembers();
    } catch (e) {
      setError(e.message || "Invite failed.");
    } finally {
      setLoadingInvite(false);
    }
  };

  const onEmailKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      invite();
    }
  };

  return (
    <div style={{ padding: 16, color: "#e9edef" }}>
      <h2 style={{ margin: "0 0 12px" }}>Team</h2>

      {/* Alerts */}
      {(error || notice) && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: error ? "#3a1f1f" : "#1e2a1f",
            border: `1px solid ${error ? "#a05555" : "#3d8b5f"}`,
            color: error ? "#ffb3b3" : "#b6ffd1",
            borderRadius: 10,
            padding: "8px 10px",
            margin: "0 0 12px",
            fontSize: 14,
          }}
        >
          {error || notice}
        </div>
      )}

      {/* Invite panel */}
      <div
        style={{
          background: "#232323",
          padding: 16,
          borderRadius: 12,
          marginBottom: 16,
          border: "1px solid #2a2a2a",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Invite Member</h3>

        {!userEmail ? (
          <div style={{ color: "#aaa" }}>Please sign in to invite team members.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={onEmailKeyDown}
                placeholder="teammate@example.com"
                autoComplete="off"
                style={{
                  flex: "1 1 260px",
                  minWidth: 240,
                  background: "#1b1b1b",
                  border: "1px solid #2f2f2f",
                  color: "#e9edef",
                  padding: "10px 12px",
                  borderRadius: 8,
                }}
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{
                  background: "#1b1b1b",
                  border: "1px solid #2f2f2f",
                  color: "#e9edef",
                  padding: "10px 12px",
                  borderRadius: 8,
                }}
              >
                <option value="member">Member</option>
                <option value="owner">Owner</option>
              </select>
              <button
                onClick={invite}
                disabled={!canInvite}
                style={{
                  background: "#f7cb53",
                  color: "#232323",
                  border: 0,
                  borderRadius: 8,
                  padding: "10px 16px",
                  fontWeight: 800,
                  cursor: canInvite ? "pointer" : "not-allowed",
                  opacity: canInvite ? 1 : 0.7,
                }}
              >
                {loadingInvite ? "Inviting…" : "Invite"}
              </button>
              <button
                onClick={loadMembers}
                style={{
                  background: "#1c1c1c",
                  color: "#e9edef",
                  border: "1px solid #2f2f2f",
                  borderRadius: 8,
                  padding: "10px 16px",
                  fontWeight: 700,
                }}
              >
                Refresh
              </button>
            </div>

            {inviteLink && (
              <div style={{ marginTop: 10 }}>
                <small style={{ color: "#bdbdbd" }}>Invite link (copy & share):</small>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 6,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      background: "#1f1f1f",
                      padding: 8,
                      borderRadius: 8,
                      wordBreak: "break-all",
                      border: "1px solid #2f2f2f",
                      color: "#d9d9d9",
                      flex: "1 1 320px",
                      minWidth: 260,
                    }}
                  >
                    {inviteLink}
                  </div>
                  <button
                    onClick={copyInvite}
                    style={{
                      background: "#2c2c2c",
                      color: "#fff",
                      border: "1px solid #3a3a3a",
                      borderRadius: 8,
                      padding: "8px 14px",
                      fontWeight: 700,
                    }}
                  >
                    Copy
                  </button>
                  <a
                    href={inviteLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: "#2c2c2c",
                      color: "#fff",
                      border: "1px solid #3a3a3a",
                      borderRadius: 8,
                      padding: "8px 14px",
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    Open
                  </a>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Members table */}
      <div
        style={{
          background: "#232323",
          padding: 16,
          borderRadius: 12,
          border: "1px solid #2a2a2a",
        }}
      >
        <h3 style={{ marginTop: 0 }}>
          Members{" "}
          <span style={{ color: "#9aa4ab", fontWeight: 600 }}>
            ({members.length})
          </span>
        </h3>

        {loading ? (
          <div style={{ color: "#9aa4ab" }}>Loading members…</div>
        ) : members.length === 0 ? (
          <div style={{ color: "#9aa4ab" }}>No members found.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "#bdbdbd", textAlign: "left" }}>
                  <th style={{ padding: "8px 6px", borderBottom: "1px solid #2a3942" }}>Email</th>
                  <th style={{ padding: "8px 6px", borderBottom: "1px solid #2a3942" }}>Name</th>
                  <th style={{ padding: "8px 6px", borderBottom: "1px solid #2a3942" }}>Role</th>
                  <th style={{ padding: "8px 6px", borderBottom: "1px solid #2a3942" }}>Last Login</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.email || m.id || m.name} style={{ borderTop: "1px solid #2a3942" }}>
                    <td style={{ padding: "10px 6px" }}>{m.email || "—"}</td>
                    <td style={{ padding: "10px 6px" }}>{m.name || "—"}</td>
                    <td style={{ padding: "10px 6px" }}>{m.role || "member"}</td>
                    <td style={{ padding: "10px 6px" }}>{formatLastLogin(m.last_login)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
