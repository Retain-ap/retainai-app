// src/components/InviteTeamModal.jsx
import React, { useState, useEffect, useRef } from "react";

// Resolve API base (CRA, Vite, or relative)
const API_BASE =
  (typeof process !== "undefined" &&
    process.env &&
    (process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE)) ||
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL)) ||
  "";

export default function InviteTeamModal({ user, onClose }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { accept_url, token }
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  // Focus first field + lock body scroll while open
  useEffect(() => {
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ESC to close
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function normalizeEmail(v) {
    return String(v || "").trim();
  }

  async function createInvite(e) {
    e.preventDefault();
    setError("");

    const normalized = normalizeEmail(email);
    if (!normalized) {
      setError("Email is required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/team/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Email": user?.email || "",
          Accept: "application/json"
        },
        body: JSON.stringify({ email: normalized, role })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        // map a couple of common server errors nicely
        if (res.status === 409) {
          throw new Error("That user is already invited or a member.");
        }
        if (res.status === 429) {
          throw new Error("Too many invites right now. Please try again later.");
        }
        throw new Error(data?.error || data?.message || "Failed to create invite.");
      }

      setResult({ accept_url: data.accept_url, token: data.token });
    } catch (err) {
      setError(err.message || "Failed to create invite.");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!result?.accept_url) return;
    try {
      await navigator.clipboard.writeText(result.accept_url);
      alert("Invite link copied!");
    } catch {
      // Fallback: select the text for manual copy
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        const el = document.getElementById("invite-link-code");
        if (el) {
          range.selectNodeContents(el);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch {}
      alert("Could not copy automatically. The link is highlighted—press Ctrl/Cmd+C.");
    }
  }

  const subject = encodeURIComponent("You're invited to join RetainAI");
  const body = encodeURIComponent(
    `Hey,\n\nYou've been invited to join our RetainAI workspace.\nClick to accept: ${result?.accept_url}\n\nThanks!`
  );

  return (
    <div
      style={styles.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
    >
      <div
        style={styles.card}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <h3 id="invite-modal-title" style={styles.title}>
            Invite a teammate
          </h3>
          <button
            type="button"
            style={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {!result ? (
          <form onSubmit={createInvite}>
            <div style={styles.field}>
              <label htmlFor="invite-email" style={styles.label}>
                Email
              </label>
              <input
                id="invite-email"
                ref={inputRef}
                style={styles.input}
                type="email"
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div style={styles.field}>
              <label htmlFor="invite-role" style={styles.label}>
                Role
              </label>
              <select
                id="invite-role"
                style={styles.select}
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <button type="submit" style={styles.primary} disabled={loading}>
              {loading ? "Creating…" : "Create Invite"}
            </button>
          </form>
        ) : (
          <div>
            <div style={styles.successBox}>
              <div style={{ color: "#f7cb53", fontWeight: 800, marginBottom: 6 }}>
                Invite created ✅
              </div>
              <div style={{ color: "#ddd", fontSize: "0.98em" }}>
                Share this link with your teammate:
              </div>
              <div style={styles.linkRow}>
                <code id="invite-link-code" style={styles.linkCode}>
                  {result.accept_url}
                </code>
                <button style={styles.secondary} onClick={copyLink} disabled={!result.accept_url}>
                  Copy
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <a href={`mailto:?subject=${subject}&body=${body}`} style={styles.outline}>
                Send via Email
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Join our RetainAI workspace: ${result.accept_url}`
                )}`}
                target="_blank"
                rel="noreferrer"
                style={styles.outline}
              >
                Send via WhatsApp
              </a>
            </div>

            <div
              style={{ marginTop: 18, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}
            >
              <button
                type="button"
                style={{ ...styles.secondary, padding: "10px 14px" }}
                onClick={() => {
                  setResult(null);
                  setEmail("");
                  setRole("member");
                  setError("");
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
              >
                Invite another teammate
              </button>
              <button style={styles.primary} onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "#0008",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999
  },
  card: {
    width: "100%",
    maxWidth: 520,
    background: "#232323",
    borderRadius: 16,
    padding: "22px 22px 20px 22px",
    border: "1.8px solid #2b2b2b",
    boxShadow: "0 12px 40px #000a"
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title: { margin: 0, color: "#f7cb53", fontWeight: 900, fontSize: "1.22em" },
  close: {
    background: "transparent",
    color: "#fff",
    border: "none",
    fontSize: 28,
    lineHeight: 1,
    cursor: "pointer"
  },
  field: { marginBottom: 14 },
  label: { display: "block", color: "#e9edef", fontWeight: 700, marginBottom: 6 },
  input: {
    width: "100%",
    padding: "12px 13px",
    borderRadius: 9,
    outline: "none",
    border: "1.5px solid #3a3a3a",
    background: "#181a1b",
    color: "#fff",
    fontWeight: 700
  },
  select: {
    width: "100%",
    padding: "12px 13px",
    borderRadius: 9,
    outline: "none",
    border: "1.5px solid #3a3a3a",
    background: "#181a1b",
    color: "#fff",
    fontWeight: 700
  },
  primary: {
    width: "100%",
    background: "#f7cb53",
    color: "#232323",
    border: "none",
    borderRadius: 9,
    padding: "13px 18px",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: "1.05em"
  },
  secondary: {
    background: "#2a2a2a",
    color: "#fff",
    border: "1px solid #3a3a3a",
    borderRadius: 8,
    padding: "8px 12px",
    fontWeight: 800,
    cursor: "pointer"
  },
  outline: {
    textDecoration: "none",
    background: "#232323",
    color: "#fff",
    border: "1.4px solid #f7cb53",
    borderRadius: 9,
    padding: "10px 14px",
    fontWeight: 800,
    display: "inline-block"
  },
  successBox: {
    background: "#1d1e20",
    borderRadius: 12,
    padding: 14,
    border: "1.5px solid #333",
    marginTop: 4
  },
  linkRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    flexWrap: "wrap"
  },
  linkCode: {
    flex: 1,
    minWidth: 280,
    background: "#141516",
    color: "#e6e6e6",
    borderRadius: 8,
    padding: "10px 12px",
    border: "1px solid #2a2a2a",
    wordBreak: "break-all"
  },
  error: {
    background: "#3a1717",
    color: "#ffd1d1",
    border: "1px solid #5a1f1f",
    borderRadius: 8,
    padding: "8px 10px",
    marginBottom: 10,
    fontWeight: 700
  }
};
