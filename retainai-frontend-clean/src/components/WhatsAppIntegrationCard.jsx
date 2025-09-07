// src/components/WhatsAppIntegrationCard.jsx
import React, { useEffect, useRef, useState } from "react";
import { SiWhatsapp } from "react-icons/si";

/* ---- API base (CRA + Vite safe) ---- */
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

/* ---- Countries to offer ---- */
const COUNTRIES = [
  { code: "+1",  name: "USA/Canada" },
  { code: "+44", name: "UK" },
  { code: "+61", name: "Australia" },
  { code: "+91", name: "India" },
  { code: "+49", name: "Germany" },
  { code: "+33", name: "France" },
  { code: "+34", name: "Spain" },
  { code: "+39", name: "Italy" },
  { code: "+81", name: "Japan" },
  { code: "+55", name: "Brazil" },
];

/* ---- Helpers ---- */
function splitCountry(number) {
  const n = String(number || "");
  for (const c of COUNTRIES) {
    if (n.startsWith(c.code)) {
      return { country: c.code, number: n.slice(c.code.length) };
    }
  }
  // default to +1; strip leading +1 if present
  return { country: "+1", number: n.replace(/^\+?1/, "") || "" };
}

function formatPhone(raw, country = "+1") {
  const s = String(raw || "");
  if (!s.startsWith("+")) return s;
  if (country === "+1" && /^\+1\d{10}$/.test(s)) {
    const d = s.slice(2);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    }
  if (/^\+\d{7,15}$/.test(s)) {
    const cLen = country.length;
    const rest = s.slice(cLen);
    const chunks = [];
    let n = rest;
    while (n.length) {
      if (n.length > 4) {
        chunks.push(n.slice(0, 3));
        n = n.slice(3);
      } else {
        chunks.push(n);
        n = "";
      }
    }
    return `${country} ${chunks.join(" ")}`;
  }
  return s;
}

const ping = (name) => window.dispatchEvent(new Event(name));

export default function WhatsAppIntegrationCard({ user, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [country, setCountry] = useState("+1");
  const [number, setNumber] = useState("");
  const [savedNumber, setSavedNumber] = useState("");
  const [error, setError] = useState("");
  const fetchAbort = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      fetchAbort.current?.abort?.();
    };
  }, []);

  // Load current user WhatsApp on mount/user change
  useEffect(() => {
    if (!user?.email) return;

    async function fetchWhatsApp() {
      setLoading(true);
      setError("");

      // cancel any in-flight fetch
      fetchAbort.current?.abort?.();
      const controller = new AbortController();
      fetchAbort.current = controller;

      try {
        const res = await fetch(
          `${API_BASE}/api/user/${encodeURIComponent(user.email)}`,
          { signal: controller.signal, credentials: "include" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Failed to fetch user");

        const wa = String(data.whatsapp || "");
        if (!mounted.current) return;

        setSavedNumber(wa);
        if (wa) {
          const { country: c, number: n } = splitCountry(wa);
          setCountry(c);
          setNumber(n.replace(/\D/g, "")); // store only digits
        } else {
          setCountry("+1");
          setNumber("");
        }
      } catch (e) {
        if (e.name !== "AbortError") setError("Failed to load WhatsApp status.");
      } finally {
        if (mounted.current) setLoading(false);
      }
    }

    fetchWhatsApp();
  }, [user?.email]);

  // Save number
  async function handleSave(e) {
    e.preventDefault();
    setError("");

    // number must be 7–15 digits (local part); final E.164 will be +CC + local
    if (!/^\d{7,15}$/.test(number)) {
      setError("Enter a valid phone number (7–15 digits).");
      return;
    }

    const fullNumber = `${country}${number}`;
    if (!/^\+\d{8,16}$/.test(fullNumber)) {
      setError("Phone number format is invalid.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/integrations/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: user.email, whatsapp: fullNumber }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Save failed");

      setSavedNumber(fullNumber);
      setEditMode(false);
      onSaved?.(fullNumber);
      ping("integrations:changed");
    } catch (e) {
      setError(e.message || "Failed to save number.");
    } finally {
      setLoading(false);
    }
  }

  // Disconnect number
  async function handleDisconnect() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/integrations/whatsapp`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to disconnect");

      setSavedNumber("");
      setNumber("");
      setCountry("+1");
      setEditMode(false);
      onSaved?.("");
      ping("integrations:changed");
    } catch (e) {
      setError(e.message || "Failed to disconnect.");
    } finally {
      setLoading(false);
    }
  }

  const hasSaved = Boolean(savedNumber);

  return (
    <div
      className="integration-card"
      style={{ minWidth: 320, maxWidth: 350, alignItems: "center" }}
      aria-busy={loading ? "true" : "false"}
    >
      <span style={{ fontSize: 32, color: "#25D366", marginBottom: 10 }}>
        <SiWhatsapp className="integration-icon whatsapp" aria-hidden />
      </span>

      <div className="integration-center" style={{ width: "100%", alignItems: "center" }}>
        <div className="integration-title" style={{ marginBottom: 4 }}>
          WhatsApp
        </div>

        <div className="integration-desc" style={{ marginBottom: 16 }}>
          {hasSaved
            ? "Your WhatsApp number is connected."
            : "Add your WhatsApp phone number to enable messaging integration."}
        </div>

        {hasSaved && !editMode && (
          <div
            style={{
              color: "#25D366",
              fontWeight: 700,
              fontSize: 17,
              marginBottom: 10,
              letterSpacing: "0.01em",
            }}
          >
            <span
              style={{
                background: "#232323",
                padding: "7px 20px",
                borderRadius: 7,
                fontWeight: 900,
                fontSize: 17,
                border: "1.5px solid #25D366",
              }}
            >
              {formatPhone(savedNumber, splitCountry(savedNumber).country)}
            </span>
          </div>
        )}

        {editMode ? (
          <form style={{ width: "100%", marginBottom: 12 }} onSubmit={handleSave}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <label className="sr-only" htmlFor="wa-country">Country code</label>
              <select
                id="wa-country"
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setNumber(""); // reset when changing country
                }}
                style={{
                  fontSize: 15,
                  borderRadius: 6,
                  padding: "7px 10px",
                  border: "1.7px solid #25D366",
                  background: "#191a1d",
                  color: "#fff",
                  flex: "0 0 120px",
                }}
                disabled={loading}
              >
                {COUNTRIES.map((c) => (
                  <option value={c.code} key={c.code}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>

              <label className="sr-only" htmlFor="wa-number">Phone number</label>
              <input
                id="wa-number"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="number"
                aria-label="Phone number"
                style={{
                  padding: "10px 16px",
                  width: "100%",
                  borderRadius: 7,
                  border: "1.7px solid #25D366",
                  fontSize: 17,
                  color: "#fff",
                  background: "#191a1d",
                }}
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))}
                disabled={loading}
                autoFocus
                maxLength={15}
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button
                className="integration-btn"
                style={{ background: "#25D366", color: "#232323", flex: 1 }}
                type="submit"
                disabled={loading}
              >
                {loading ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                className="integration-btn-outline"
                onClick={() => {
                  const parts = splitCountry(savedNumber);
                  setCountry(parts.country || "+1");
                  setNumber((parts.number || "").replace(/\D/g, ""));
                  setEditMode(false);
                }}
                style={{ flex: 1 }}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", gap: 10, width: "100%" }}>
            {hasSaved ? (
              <>
                <button
                  className="integration-btn"
                  style={{ background: "#25D366", color: "#232323", flex: 1 }}
                  onClick={() => setEditMode(true)}
                  disabled={loading}
                >
                  Edit
                </button>
                <button
                  className="integration-btn-outline"
                  onClick={handleDisconnect}
                  style={{ flex: 1, borderColor: "#e66565", color: "#e66565" }}
                  disabled={loading}
                >
                  {loading ? "Removing…" : "Disconnect"}
                </button>
              </>
            ) : (
              <button
                className="integration-btn"
                style={{ background: "#25D366", color: "#232323", flex: 1 }}
                onClick={() => setEditMode(true)}
                disabled={loading || !user?.email}
                title={!user?.email ? "Please sign in first" : "Connect WhatsApp"}
              >
                Connect
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="integration-error" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
