// src/components/TokenGenerator.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

// Backend endpoints (adjust paths if your server differs)
const EXCHANGE_ENDPOINT = `${API_BASE}/api/instagram/exchange-token`; // POST { short_lived_token }
const STORE_ENDPOINT    = `${API_BASE}/api/instagram/store-token`;   // POST { access_token, user_email? }

export default function TokenGenerator() {
  const [shortToken, setShortToken] = useState("");
  const [longToken, setLongToken]   = useState("");
  const [expiresIn, setExpiresIn]   = useState(null); // seconds, if returned
  const [status, setStatus]         = useState("");
  const [error, setError]           = useState("");
  const [busy, setBusy]             = useState(false);
  const [showLong, setShowLong]     = useState(false);

  const abortRef = useRef(null);

  // Pull user email for attribution (optional)
  const userEmail = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      return u?.email || "";
    } catch {
      return "";
    }
  }, []);

  // Basic sanity check (non-empty & not obviously placeholders)
  const canExchange = useMemo(() => {
    const t = (shortToken || "").trim();
    return (
      !!t &&
      !t.includes("YOUR_APP_ID") &&
      !t.includes("YOUR_APP_SECRET") &&
      t.length > 20 && // short-lived IG tokens are long
      !busy
    );
  }, [shortToken, busy]);

  // Helpers
  const safeJson = async (res) => {
    try { return await res.json(); } catch { return {}; }
  };

  const copy = async (text) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setStatus("📋 Copied to clipboard.");
      setTimeout(() => setStatus(""), 1500);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  // Exchange via BACKEND (never expose app secret in browser)
  const handleExchange = useCallback(async () => {
    if (!canExchange) return;
    setBusy(true);
    setError("");
    setStatus("⏳ Exchanging short-lived token…");

    // cancel in-flight
    abortRef.current?.abort?.();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(EXCHANGE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(userEmail ? { "X-User-Email": userEmail } : {}) },
        body: JSON.stringify({ short_lived_token: shortToken.trim() }),
        signal: controller.signal,
      });
      const data = await safeJson(res);

      if (!res.ok || !data.access_token) {
        const msg = data.error || `Exchange failed (${res.status})`;
        throw new Error(msg);
      }

      setLongToken(data.access_token);
      setExpiresIn(typeof data.expires_in === "number" ? data.expires_in : null);
      setStatus("✅ Long-lived token generated.");
      setShowLong(false);

      // Save token to backend (best-effort; non-blocking UX)
      setStatus("💾 Saving token…");
      const saveRes = await fetch(STORE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(userEmail ? { "X-User-Email": userEmail } : {}) },
        body: JSON.stringify({ access_token: data.access_token, user_email: userEmail }),
        signal: controller.signal,
      });
      const saveData = await safeJson(saveRes);
      if (!saveRes.ok) {
        setStatus("⚠️ Token generated, but saving failed.");
        setError(saveData.error || `Store failed (${saveRes.status})`);
      } else {
        setStatus("✅ Token saved.");
      }
    } catch (e) {
      if (e.name === "AbortError") return;
      setError(e.message || "Network or server error.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }, [canExchange, shortToken, userEmail]);

  useEffect(() => () => abortRef.current?.abort?.(), []);

  const ttlText = useMemo(() => {
    if (!expiresIn || typeof expiresIn !== "number") return "";
    const days = Math.floor(expiresIn / 86400);
    const hours = Math.floor((expiresIn % 86400) / 3600);
    return `Expires in ${days}d ${hours}h`;
  }, [expiresIn]);

  return (
    <section className="bg-brand-black text-white py-12 px-6 rounded-xl shadow-lg max-w-3xl mx-auto border border-brand-gold mt-12">
      <h2 className="text-2xl font-bold mb-4 text-brand-gold text-center">🎯 Instagram Token Generator</h2>

      {/* status / error */}
      {(status || error) && (
        <div
          className={`mb-4 text-sm rounded p-3 ${error ? "bg-red-900/50 border border-red-500 text-red-200" : "bg-emerald-900/40 border border-emerald-500 text-emerald-200"}`}
          role="status"
          aria-live="polite"
        >
          {error || status}
        </div>
      )}

      <label className="block text-sm text-gray-300 mb-2">Paste short-lived token</label>
      <input
        type="text"
        placeholder="EAAG… short-lived token"
        value={shortToken}
        onChange={(e) => setShortToken(e.target.value)}
        className="w-full p-3 rounded mb-4 text-black"
        autoComplete="off"
        spellCheck={false}
      />

      <button
        onClick={handleExchange}
        disabled={!canExchange}
        className={`bg-brand-gold text-black font-semibold px-6 py-3 rounded transition w-full ${canExchange ? "hover:bg-brand-goldHover cursor-pointer" : "opacity-60 cursor-not-allowed"}`}
      >
        {busy ? "Working…" : "Get Long-Lived Token"}
      </button>

      {longToken && (
        <div className="mt-6 text-sm bg-gray-800 p-3 rounded text-green-200">
          <div className="flex items-center justify-between gap-2 mb-2">
            <strong className="text-green-300">Long-lived token</strong>
            <div className="flex items-center gap-2">
              {ttlText && <span className="text-gray-300">{ttlText}</span>}
              <button
                type="button"
                onClick={() => setShowLong((s) => !s)}
                className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600"
              >
                {showLong ? "Hide" : "Show"}
              </button>
              <button
                type="button"
                onClick={() => copy(longToken)}
                className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600"
              >
                Copy
              </button>
            </div>
          </div>

          <div className="break-words select-all">
            {showLong ? longToken : "•".repeat(Math.min(24, longToken.length)) + "  (hidden)"}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400 leading-relaxed">
        For security, the exchange is performed on your server (never expose your Facebook App Secret in the browser).
      </p>
    </section>
  );
}
