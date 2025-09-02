import React, { useEffect, useState } from "react";
import { SiWhatsapp } from "react-icons/si";

// Add any country codes you want here!
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

// Split a raw number into country code and local part
function splitCountry(number) {
  for (const c of COUNTRIES) {
    if (number?.startsWith(c.code)) {
      return { country: c.code, number: number.slice(c.code.length) };
    }
  }
  return { country: "+1", number: number?.replace(/^\+?1/, "") || "" };
}

// Format for display (xxx) xxx-xxxx for US/Canada, or space-separated for others
function formatPhone(raw, country = "+1") {
  if (country === "+1" && /^\+1\d{10}$/.test(raw)) {
    const digits = raw.slice(2);
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  // For other countries, show as +xx xxx xxx xxxx (group every 3-4 digits)
  if (/^\+\d{7,15}$/.test(raw)) {
    // group all after country code into chunks of 3-4
    const countryLen = country.length;
    let groups = [];
    let n = raw.slice(countryLen);
    while (n.length > 0) {
      if (n.length > 4) {
        groups.push(n.slice(0, 3));
        n = n.slice(3);
      } else {
        groups.push(n);
        n = "";
      }
    }
    return `${country} ${groups.join(" ")}`;
  }
  return raw;
}

export default function WhatsAppIntegrationCard({ user }) {
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [country, setCountry] = useState("+1");
  const [number, setNumber] = useState("");
  const [savedNumber, setSavedNumber] = useState("");
  const [error, setError] = useState("");

  // --- Load WhatsApp number on mount & user change
  useEffect(() => {
    async function fetchWhatsApp() {
      setLoading(true); setError("");
      try {
        const res = await fetch(`/api/user/${encodeURIComponent(user.email)}`);
        if (!res.ok) throw new Error("Failed to fetch user");
        const data = await res.json();
        setSavedNumber(data.whatsapp || "");
        if (data.whatsapp) {
          const { country, number } = splitCountry(data.whatsapp);
          setCountry(country);
          setNumber(number);
        } else {
          setCountry("+1");
          setNumber("");
        }
      } catch (e) {
        setError("Failed to load WhatsApp status.");
      }
      setLoading(false);
    }
    if (user?.email) fetchWhatsApp();
  }, [user]);

  // --- Save number
  async function handleSave(e) {
    e.preventDefault();
    if (!number || !/^\d{7,15}$/.test(number)) {
      setError("Enter a valid phone number (7-15 digits).");
      return;
    }
    setLoading(true); setError("");
    const fullNumber = `${country}${number}`;
    try {
      const res = await fetch("/api/integrations/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, whatsapp: fullNumber }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSavedNumber(fullNumber);
      setEditMode(false);
    } catch (e) {
      setError("Failed to save number.");
    }
    setLoading(false);
  }

  // --- Disconnect number
  async function handleDisconnect() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/integrations/whatsapp", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      setSavedNumber("");
      setNumber("");
      setEditMode(false);
      setCountry("+1");
    } catch (e) {
      setError("Failed to disconnect.");
    }
    setLoading(false);
  }

  return (
    <div className="integration-card" style={{ minWidth: 320, maxWidth: 350, alignItems: "center" }}>
      <span style={{ fontSize: 32, color: "#25D366", marginBottom: 10 }}>
        <SiWhatsapp className="integration-icon whatsapp" />
      </span>
      <div className="integration-center" style={{ width: "100%", alignItems: "center" }}>
        <div className="integration-title" style={{ marginBottom: 4 }}>
          WhatsApp
        </div>
        <div className="integration-desc" style={{ marginBottom: 16 }}>
          {savedNumber
            ? "Your WhatsApp number is connected."
            : "Add your WhatsApp phone number to enable messaging integration."}
        </div>
        {savedNumber && !editMode ? (
          <div style={{
            color: "#25D366", fontWeight: 700, fontSize: 17, marginBottom: 10, letterSpacing: "0.01em"
          }}>
            <span style={{
              background: "#232323", padding: "7px 20px", borderRadius: 7, fontWeight: 900, fontSize: 17, border: "1.5px solid #25D366"
            }}>
              {formatPhone(savedNumber, splitCountry(savedNumber).country)}
            </span>
          </div>
        ) : null}

        {editMode ? (
          <form style={{ width: "100%", marginBottom: 12 }} onSubmit={handleSave}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select
                value={country}
                onChange={e => {
                  setCountry(e.target.value);
                  setNumber(""); // reset number when changing country
                }}
                style={{
                  fontSize: 15,
                  borderRadius: 6,
                  padding: "7px 10px",
                  border: "1.7px solid #25D366",
                  background: "#191a1d",
                  color: "#fff",
                  flex: "0 0 110px"
                }}
                disabled={loading}
              >
                {COUNTRIES.map(c => (
                  <option value={c.code} key={c.code}>{c.name} ({c.code})</option>
                ))}
              </select>
              <input
                type="tel"
                className="field-input"
                placeholder="number"
                style={{
                  padding: "10px 16px",
                  width: "100%",
                  borderRadius: 7,
                  border: "1.7px solid #25D366",
                  fontSize: 17,
                  color: "#fff",
                  background: "#191a1d"
                }}
                value={number}
                onChange={e => setNumber(e.target.value.replace(/\D/g, ""))}
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
                className="integration-btn-outline"
                onClick={e => { e.preventDefault(); setEditMode(false); setCountry(splitCountry(savedNumber).country); setNumber(splitCountry(savedNumber).number); }}
                style={{ flex: 1 }}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", gap: 10, width: "100%" }}>
            {savedNumber ? (
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
                disabled={loading}
              >
                Connect
              </button>
            )}
          </div>
        )}
        {error && <div className="integration-error" style={{ marginTop: 10 }}>{error}</div>}
      </div>
    </div>
  );
}
