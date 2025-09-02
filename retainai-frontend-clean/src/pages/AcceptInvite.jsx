// src/pages/AcceptInvite.jsx
import React, { useEffect, useState } from "react";

export default function AcceptInvite() {
  // CRA/Webpack-friendly env detection (no import.meta)
  const apiBase =
    (typeof window !== "undefined" && window.__API_BASE__) ||
    process.env.REACT_APP_API_BASE ||
    "http://localhost:5000";

  // ===== Inline CSS (scoped) =====
  const css = `
  :root { --accent:#f2c44c; --bg:#0f1115; --panel:#1b1d21; --border:#292b30; --fg:#e9edef; }
  .ai-accept-body{ min-height:100vh; background:var(--bg); color:var(--fg); display:flex; align-items:center; justify-content:center; padding:28px; }
  .ai-accept-card{ width:520px; max-width:94vw; background:var(--panel); border:1px solid var(--border); border-radius:14px; box-shadow:0 16px 40px rgba(0,0,0,.45); overflow:hidden; }
  .ai-accept-head{ padding:18px 20px; font-weight:800; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
  .ai-accept-sub{ opacity:.9; font-size:.95rem; }
  .ai-accept-content{ padding:18px 20px; display:flex; flex-direction:column; gap:12px; }
  .ai-row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .ai-chip{ display:inline-block; padding:4px 10px; border-radius:999px; background:#1f2329; border:1px solid var(--border); font-size:12px; }
  .ai-label{ font-weight:700; font-size:.95rem; margin-top:6px; }
  .ai-input{ width:100%; background:#111317; border:1px solid var(--border); color:var(--fg); padding:12px 12px; border-radius:10px; outline:none; }
  .ai-input:focus{ border-color:#3a3d44; }
  .ai-input[readonly]{ opacity:.85; }
  .ai-btn{ background:var(--accent); color:#111; font-weight:800; border:none; padding:12px 16px; border-radius:10px; cursor:pointer; }
  .ai-btn[disabled]{ opacity:.6; cursor:not-allowed; }
  .ai-msg{ margin-top:6px; }
  .ai-err{ color:#ff8c8c; font-weight:700; }
  .ai-ok{ color:#97e597; font-weight:700; }
  `;

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setMsg({ type: "", text: "" });
      try {
        if (!token) throw new Error("Missing invite token.");
        const res = await fetch(`${apiBase}/api/team/invite/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Invite not found");
        if (mounted) {
          setInvite(data.invite);
          setEmail(data.invite.email || "");
        }
      } catch (e) {
        if (mounted) setMsg({ type: "err", text: e.message });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [token, apiBase]);

  async function accept() {
    if (!name.trim()) {
      setMsg({ type: "err", text: "Please enter your name." });
      return;
    }
    setBusy(true);
    setMsg({ type: "", text: "" });
    try {
      const res = await fetch(`${apiBase}/api/team/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: name.trim(), email })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to accept invite");
      setMsg({ type: "ok", text: "Invite accepted! Redirecting to login…" });
      setTimeout(() => { window.location.href = "/login"; }, 900);
    } catch (e) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div className="ai-accept-body"><div className="ai-accept-card">
          <div className="ai-accept-head">Accept Invite</div>
          <div className="ai-accept-content">Loading…</div>
        </div></div>
      </>
    );
  }

  if (!invite) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div className="ai-accept-body"><div className="ai-accept-card">
          <div className="ai-accept-head">Accept Invite</div>
          <div className="ai-accept-content">
            <div className="ai-msg ai-err">{msg.text || "Invite not found."}</div>
          </div>
        </div></div>
      </>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="ai-accept-body">
        <div className="ai-accept-card">
          <div className="ai-accept-head">
            Accept Invite
            <span className="ai-accept-sub">Secure join flow</span>
          </div>

          <div className="ai-accept-content">
            <div className="ai-row">
              <span className="ai-chip">Org: {invite.org_id}</span>
              <span className="ai-chip">Role: {invite.role}</span>
            </div>

            <label className="ai-label">Your Name</label>
            <input
              className="ai-input"
              placeholder="Your Name"
              value={name}
              onChange={e=>setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" ? accept() : null}
              autoFocus
            />

            <label className="ai-label">Email (must match invite)</label>
            <input className="ai-input" value={email} readOnly />

            {msg.text && (
              <div className={`ai-msg ${msg.type === "err" ? "ai-err" : "ai-ok"}`}>{msg.text}</div>
            )}

            <div style={{display:"flex", gap:10, marginTop:4}}>
              <button className="ai-btn" onClick={accept} disabled={busy}>
                {busy ? "Joining…" : "Accept Invite"}
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
