import React, { useEffect, useState } from "react";

export default function TeamSettings({ user }) {
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [inviteLink, setInviteLink] = useState(null);
  const apiBase = process.env.REACT_APP_API_BASE || "http://localhost:5000";

  async function loadMembers() {
    const res = await fetch(`${apiBase}/api/team/members`, { headers: { "X-User-Email": user?.email || "" }});
    const data = await res.json();
    setMembers(data.members || []);
  }
  useEffect(() => { loadMembers(); }, []);

  async function invite() {
    const res = await fetch(`${apiBase}/api/team/invite`, {
      method: "POST",
      headers: { "Content-Type":"application/json", "X-User-Email": user?.email || "" },
      body: JSON.stringify({ email, role })
    });
    const data = await res.json();
    if (data.accept_url) setInviteLink(data.accept_url);
    setEmail("");
  }

  return (
    <div style={{ padding: 16, color: "#e9edef" }}>
      <h2>Team</h2>

      <div style={{ background:"#232323", padding:16, borderRadius:12, marginBottom:16 }}>
        <h3>Invite Member</h3>
        <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="teammate@example.com" />
        <select value={role} onChange={e=>setRole(e.target.value)} style={{ marginLeft:8 }}>
          <option value="member">Member</option>
          <option value="owner">Owner</option>
        </select>
        <button onClick={invite} style={{ marginLeft:8 }}>Invite</button>
        {inviteLink && (
          <div style={{ marginTop: 8 }}>
            <small>Invite link (copy & send): </small>
            <div style={{ background:"#1f1f1f", padding:8, borderRadius:8, wordBreak:"break-all" }}>{inviteLink}</div>
          </div>
        )}
      </div>

      <div style={{ background:"#232323", padding:16, borderRadius:12 }}>
        <h3>Members</h3>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Last Login</th></tr></thead>
          <tbody>
            {members.map((m,i)=>(
              <tr key={i} style={{ borderTop:"1px solid #2a3942" }}>
                <td>{m.email}</td><td>{m.name}</td><td>{m.role}</td><td>{m.last_login || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
