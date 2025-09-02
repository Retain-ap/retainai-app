// src/components/ImportContacts.jsx
import React, { useState } from "react";

export default function ImportContacts({ user }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const apiBase = process.env.REACT_APP_API_BASE || "http://localhost:5000";

  async function handlePreview() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${apiBase}/api/import/csv/preview`, {
      method: "POST",
      headers: { "X-User-Email": user?.email || "" },
      body: form
    });
    const data = await res.json();
    setPreview(data);
    setLoading(false);
  }

  function toggleRow(i) {
    const copy = { ...preview, rows: preview.rows.map((r, idx) => idx === i ? { ...r, selected: r.selected === false ? true : (r.selected === true ? false : false) } : r) };
    setPreview(copy);
  }

  function selectAll(val) {
    const copy = { ...preview, rows: preview.rows.map(r => ({ ...r, selected: val })) };
    setPreview(copy);
  }

  async function handleImport() {
    if (!preview) return;
    setLoading(true);
    const payload = {
      rows: preview.rows.map(r => ({ ...r, selected: r.selected !== false }))
    };
    const res = await fetch(`${apiBase}/api/import/csv/commit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Email": user?.email || ""
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    setResult(data?.summary || data);
    setLoading(false);
  }

  return (
    <div style={{ padding: 16, color: "#e9edef" }}>
      <h2 style={{ marginBottom: 12 }}>Import Contacts</h2>

      <div style={{ background: "#232323", padding: 16, borderRadius: 12, marginBottom: 16 }}>
        <h3>1) CSV Import</h3>
        <input type="file" accept=".csv,text/csv" onChange={e => setFile(e.target.files?.[0] || null)} />
        <button onClick={handlePreview} disabled={!file || loading} style={{ marginLeft: 8 }}>Preview</button>
      </div>

      {preview && (
        <div style={{ background: "#232323", padding: 16, borderRadius: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Preview ({preview.preview_count} of {preview.total_rows})</h3>
            <div>
              <button onClick={() => selectAll(true)} style={{ marginRight: 8 }}>Select All</button>
              <button onClick={() => selectAll(false)}>Deselect All</button>
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th></th><th>Name</th><th>Emails</th><th>Phones</th><th>Company</th><th>Title</th><th>Notes</th><th>Dup</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid #2a3942", background: r.duplicate ? "#1f1f1f" : "transparent" }}>
                  <td>
                    <input
                      type="checkbox"
                      checked={r.selected !== false}
                      onChange={() => toggleRow(i)}
                    />
                  </td>
                  <td>{r.name}</td>
                  <td>{(r.emails || []).join(", ")}</td>
                  <td>{(r.phones || []).join(", ")}</td>
                  <td>{r.company}</td>
                  <td>{r.title}</td>
                  <td style={{ maxWidth: 240, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.notes}</td>
                  <td>{r.duplicate ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleImport} disabled={loading} style={{ marginTop: 12 }}>Import Selected</button>
        </div>
      )}

      {result && (
        <div style={{ background: "#232323", padding: 16, borderRadius: 12 }}>
          <h3>Success</h3>
          <p>Imported: <b>{result.imported}</b> &nbsp; Merged: <b>{result.merged}</b> &nbsp; Skipped: <b>{result.skipped}</b></p>
          <p>Total leads (after): <b>{result.total_after}</b></p>
        </div>
      )}

      {/* Google import button (auth-only placeholder for today) */}
      <div style={{ background: "#232323", padding: 16, borderRadius: 12, marginTop: 16 }}>
        <h3>2) Google Contacts</h3>
        <p>Connect Google to import contacts (coming right after CSV).</p>
        <button disabled title="Connect Google (coming next)">Connect Google</button>
      </div>

      {loading && <p>Working…</p>}
    </div>
  );
}
