// src/components/TokenStatusCard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

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

function Row({ label, value }) {
  const ok = !!value;
  return (
    <p className="flex items-center gap-2">
      <span className="opacity-80">{label}:</span>
      <span className={ok ? "text-emerald-400" : "text-red-400"}>
        {ok ? "✅ Present" : "❌ Missing"}
      </span>
    </p>
  );
}

export default function TokenStatusCard({
  service = "automations",   // "automations" | "whatsapp"
  user,                      // optional; if provided will append ?user_email=...
  pollMs = 0,                // optional; e.g. 15000 to auto-refresh every 15s
}) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const abortRef = useRef(null);

  const path = useMemo(() => {
    const base =
      service === "whatsapp"
        ? "/api/whatsapp/health"
        : "/api/automations/health";
    const q = user?.email ? `?user_email=${encodeURIComponent(user.email)}` : "";
    return `${API_BASE}${base}${q}`;
  }, [service, user?.email]);

  const load = async () => {
    // cancel any in-flight request
    abortRef.current?.abort?.();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    try {
      const res = await fetch(path, { signal: controller.signal });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `Request failed (${res.status})`);
      }
      setData(json || {});
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.message || "Network error");
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (pollMs > 0) {
      const id = setInterval(load, pollMs);
      return () => {
        clearInterval(id);
        abortRef.current?.abort?.();
      };
    }
    return () => abortRef.current?.abort?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, pollMs]);

  const accessOK   = !!(data?.access_token_present || data?.accessTokenPresent);
  const acctIdOK   = !!(data?.instagram_account_id_present || data?.instagramAccountIdPresent);
  const statusText = data?.status || data?.message || (accessOK ? "ok" : "unconfigured");

  return (
    <div className="bg-dark border-2 border-gold rounded-xl p-6 m-4 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">🎯 Token Status</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="px-3 py-1 rounded border border-gold text-gold hover:bg-gold hover:text-black transition"
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="text-red-400 bg-red-900/30 border border-red-700 rounded p-3">
          {error}
        </div>
      ) : loading ? (
        <p>Loading token status…</p>
      ) : (
        <div className="space-y-2">
          <Row label="Access Token" value={accessOK} />
          <Row label="Instagram Account ID" value={acctIdOK} />
          <p>
            <span className="opacity-80">Status:</span>{" "}
            <span className="font-semibold">{String(statusText)}</span>
          </p>

          {/* Optional: dump payload for debugging (collapsed look) */}
          <details className="mt-3">
            <summary className="cursor-pointer opacity-80">Details (raw)</summary>
            <pre className="text-xs mt-2 bg-black/40 p-3 rounded overflow-auto">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
