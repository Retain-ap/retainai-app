// src/components/ImportContacts.jsx
import React, { useState } from "react";

/* ---------- API BASE (unified across CRA & Vite) ---------- */
function resolveApiBase() {
  // Prefer Vite-style first, then CRA-style, then sane default by host
  const vite = (typeof import.meta !== "undefined" &&
    import.meta.env &&
    (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL)) || null;

  const cra =
    (typeof process !== "undefined" &&
      process.env &&
      (process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE)) ||
    null;

  if (vite) return vite;
  if (cra) return cra;

  if (
    typeof window !== "undefined" &&
    window.location &&
    window.location.hostname.includes("localhost")
  ) {
    return "http://localhost:5000";
  }
  return "https://retainai-app.onrender.com";
}
const API_BASE = resolveApiBase();

/* ---------- Component ---------- */
export default function ImportContacts({ user }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handlePreview() {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${API_BASE}/api/import/csv/preview`, {
        method: "POST",
        headers: { "X-User-Email": user?.email || "" },
        body: form,
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        /* ignore json parse */
      }
      if (!res.ok) {
        throw new Error(
          (data && (data.error || data.message)) || `${res.status} ${res.statusText}`
        );
      }

      setPreview(data || { rows: [], total_rows: 0, preview_count: 0 });
    } catch (e) {
      setError(String(e.message || e));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(i) {
    if (!preview?.rows?.length) return;
    setPreview((p) => {
      const nextRows = p.rows.map((r, idx) => {
        if (idx !== i) return r;
        // Checkbox uses `r.selected !== false` for checked state; invert that.
        const nextSelected = !(r.selected !== false);
        return { ...r, selected: nextSelected };
      });
      return { ...p, rows: nextRows };
    });
  }

  function selectAll(val) {
    if (!preview?.rows?.length) return;
    setPreview((p) => ({
      ...p,
      rows: p.rows.map((r) => ({ ...r, selected: !!val })),
    }));
  }

  async function handleImport() {
    if (!preview?.rows?.length) return;
    setLoading(true);
    setError("");

    try {
      const payload = {
        rows: preview.rows.map((r) => ({ ...r, selected: r.selected !== false })),
      };

      const res = await fetch(`${API_BASE}/api/import/csv/commit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Email": user?.email || "",
        },
        body: JSON.stringify(payload),
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        throw new Error(
          (data && (data.error || data.message)) || `${res.status} ${res.statusText}`
        );
      }

      setResult(data?.summary || data || {});
      // reset selection state so they don’t double-import by accident
      setPreview(null);
      setFile(null);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  const totalRows = preview?.total_rows ?? 0;
  const shownRows = preview?.preview_count ?? preview?.rows?.length ?? 0;
  const selectedCount =
    preview?.rows?.filter((r) => r.selected !== false).length ?? 0;

  return (
    <div style={{ padding: 16, color: "#e9edef" }}>
      <h2 style={{ marginBottom: 12 }}>Import Contacts</h2>

      {/* CSV Import */}
      <div
        style={{
          background: "#232323",
          padding: 16,
          borderRadius: 12,
          marginBottom: 16,
          border: "1px solid #2a3942",
        }}
      >
        <h3>1) CSV Import</h3>
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setError("");
              setResult(null);
              setPreview(null);
              setFile(e.target.files?.[0] || null);
            }}
          />
          <button onClick={handlePreview} disabled={!file || loading}>
            {loading ? "Working…" : "Preview"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: "#9fb0bb", marginTop: 8 }}>
          Tip: Columns like <code>Name</code>, <code>Email</code>,{" "}
          <code>Phone</code>, <code>Company</code>, <code>Title</code>,{" "}
          <code>Notes</code> are detected automatically.
        </div>
        {error && (
          <div
            style={{
              marginTop: 10,
              color: "#ffbcbc",
              background: "#3a1111",
              border: "1px solid #4a1515",
              borderRadius: 8,
              padding: 10,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Preview Table */}
      {preview?.rows?.length ? (
        <div
          style={{
            background: "#232323",
            padding: 16,
            borderRadius: 12,
            marginBottom: 16,
            border: "1px solid #2a3942",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <h3 style={{ margin: 0 }}>
              Preview ({shownRows} of {totalRows})
            </h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "#9fb0bb", fontSize: 13 }}>
                Selected: <b style={{ color: "#ffd966" }}>{selectedCount}</b>
              </span>
              <button onClick={() => selectAll(true)}>Select All</button>
              <button onClick={() => selectAll(false)}>Deselect All</button>
            </div>
          </div>

          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", fontWeight: 800 }}>
                  <th style={{ padding: 8 }} />
                  <th style={{ padding: 8 }}>Name</th>
                  <th style={{ padding: 8 }}>Emails</th>
                  <th style={{ padding: 8 }}>Phones</th>
                  <th style={{ padding: 8 }}>Company</th>
                  <th style={{ padding: 8 }}>Title</th>
                  <th style={{ padding: 8 }}>Notes</th>
                  <th style={{ padding: 8 }}>Dup</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr
                    key={i}
                    style={{
                      borderTop: "1px solid #2a3942",
                      background: r.duplicate ? "#1f1f1f" : "transparent",
                    }}
                  >
                    <td style={{ padding: 8 }}>
                      <input
                        type="checkbox"
                        checked={r.selected !== false}
                        onChange={() => toggleRow(i)}
                      />
                    </td>
                    <td style={{ padding: 8 }}>{r.name}</td>
                    <td style={{ padding: 8 }}>
                      {(r.emails || []).join(", ")}
                    </td>
                    <td style={{ padding: 8 }}>
                      {(r.phones || []).join(", ")}
                    </td>
                    <td style={{ padding: 8 }}>{r.company}</td>
                    <td style={{ padding: 8 }}>{r.title}</td>
                    <td
                      style={{
                        padding: 8,
                        maxWidth: 320,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={r.notes}
                    >
                      {r.notes}
                    </td>
                    <td style={{ padding: 8 }}>{r.duplicate ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleImport}
            disabled={loading || !selectedCount}
            style={{ marginTop: 12 }}
          >
            {loading ? "Importing…" : "Import Selected"}
          </button>
        </div>
      ) : null}

      {/* Result Summary */}
      {result && (
        <div
          style={{
            background: "#232323",
            padding: 16,
            borderRadius: 12,
            border: "1px solid #2a3942",
          }}
        >
          <h3>Success</h3>
          <p>
            Imported: <b>{result.imported ?? 0}</b> &nbsp; Merged:{" "}
            <b>{result.merged ?? 0}</b> &nbsp; Skipped:{" "}
            <b>{result.skipped ?? 0}</b>
          </p>
          <p>
            Total leads (after): <b>{result.total_after ?? "-"}</b>
          </p>
        </div>
      )}

      {/* Google Contacts (placeholder) */}
      <div
        style={{
          background: "#232323",
          padding: 16,
          borderRadius: 12,
          marginTop: 16,
          border: "1px solid #2a3942",
        }}
      >
        <h3>2) Google Contacts</h3>
        <p>Connect Google to import contacts (coming right after CSV).</p>
        <button disabled title="Connect Google (coming next)">
          Connect Google
        </button>
      </div>

      {loading && !preview && <p style={{ marginTop: 10 }}>Working…</p>}
    </div>
  );
}
