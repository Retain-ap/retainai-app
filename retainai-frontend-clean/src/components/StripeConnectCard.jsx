// src/components/StripeConnectCard.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// ---- API base (CRA + Vite safe) ----
const RAW_API =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_URL) ||
  (typeof window !== "undefined" && window.location.origin) ||
  "";

const API = String(RAW_API || "").replace(/\/$/, "");

// Small helper: fetch with timeout + JSON parsing
async function fetchJSON(url, options = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

export default function StripeConnectCard({ user, refreshUser }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const userEmail = user?.email || "";
  const isConnected = useMemo(
    () => user?.stripe_connected === true || Boolean(user?.stripe_account_id),
    [user?.stripe_connected, user?.stripe_account_id]
  );

  // Clean Stripe return params & optionally refresh user
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const didConnect = params.get("stripe_connected") === "1";
    const didRefresh = params.get("stripe_refresh") === "1";
    const stripeErr = params.get("stripe_error");

    if (didConnect || didRefresh || stripeErr) {
      if (didConnect || didRefresh) {
        // Pull freshest status after onboarding/refresh
        if (typeof refreshUser === "function") {
          refreshUser().catch(() => {});
        }
      }
      if (stripeErr) {
        setError(decodeURIComponent(stripeErr));
      }
      // Remove our params from URL
      params.delete("stripe_connected");
      params.delete("stripe_refresh");
      params.delete("stripe_error");
      const clean = params.toString();
      if (clean) {
        navigate({ pathname: location.pathname, search: `?${clean}` }, { replace: true });
      } else {
        navigate(location.pathname, { replace: true });
      }
    }
  }, [location.pathname, location.search, navigate, refreshUser]);

  const guardUser = useCallback(() => {
    if (!userEmail) {
      setError("Please sign in to manage Stripe.");
      return true;
    }
    return false;
  }, [userEmail]);

  async function openLink(endpoint) {
    if (guardUser()) return;
    setLoading(true);
    setError("");
    try {
      const { ok, data, status } = await fetchJSON(
        `${API}/api/stripe/${endpoint}?user_email=${encodeURIComponent(userEmail)}`
      );
      if (ok && data?.url) {
        window.location.assign(data.url);
      } else {
        setError(data?.error || `Unexpected response (${status})`);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Open Stripe Express dashboard
  const handleDashboard = () => openLink("dashboard-link");

  // Link an existing Stripe account (OAuth)
  const handleLinkExisting = () => openLink("oauth/connect");

  // Create a new Stripe account (Express onboarding)
  const handleSignup = () => openLink("connect-url");

  // Disconnect current Stripe account
  const handleDisconnect = async () => {
    if (guardUser()) return;
    if (!window.confirm("Disconnect your Stripe account from RetainAI?")) return;

    setLoading(true);
    setError("");
    try {
      const { ok, data, status } = await fetchJSON(
        `${API}/api/stripe/disconnect?user_email=${encodeURIComponent(userEmail)}`,
        { method: "POST" }
      );
      if (!ok) {
        setError(data?.error || `Failed to disconnect (${status})`);
      }
      if (typeof refreshUser === "function") {
        await refreshUser();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const disabled = loading || !userEmail;

  return (
    <div
      className={`integration-card${isConnected ? " stripe-connected" : ""}`}
      aria-busy={loading ? "true" : "false"}
    >
      <div
        style={{
          width: "100%",
          minHeight: 240,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 34, color: "#635bff", marginBottom: 12 }} aria-hidden>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="Stripe">
            <path d="M7.8 4.5h8.4v2.1H11.7c-2.1 0-3.3 1.2-3.3 3s1.2 3 3.3 3H16c2.1 0 3.6 1.2 3.6 3.9 0 2.7-1.8 4.5-5.4 4.5H8.1v-2.1h6.6c1.8 0 2.7-1.2 2.7-2.7 0-1.5-.9-2.7-2.7-2.7H8.1v-2.1H16c1.8 0 3-1.2 3-2.7s-1.2-2.7-3-2.7H7.8v-2.1z" />
          </svg>
        </span>

        <div style={{ width: "100%", textAlign: "center" }}>
          <div style={{ fontWeight: 700, color: "#fff", fontSize: 20, marginBottom: 2 }}>
            Stripe Payments
          </div>
          <div style={{ color: "#aaa", fontSize: 15, margin: "2px 0 18px 0" }}>
            {userEmail
              ? isConnected
                ? "Your Stripe account is connected."
                : "Connect or create a Stripe account to accept payments."
              : "Sign in to connect your Stripe account."}
          </div>

          {isConnected ? (
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
              <button className="settings-btn connected" disabled>
                Connected
              </button>
              <button className="settings-btn" onClick={handleDashboard} disabled={disabled}>
                {loading ? "Opening…" : "Open Stripe Dashboard"}
              </button>
              <button className="settings-btn refresh" onClick={refreshUser} disabled={loading || !userEmail}>
                Refresh Status
              </button>
              <button
                className="settings-btn disconnect"
                onClick={handleDisconnect}
                disabled={disabled}
                style={{ background: "#e66565" }}
              >
                {loading ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
              <button className="settings-btn" onClick={handleLinkExisting} disabled={disabled}>
                {loading ? "Redirecting…" : "Link Existing Stripe Account"}
              </button>
              <button className="settings-btn" onClick={handleSignup} disabled={disabled}>
                {loading ? "Redirecting…" : "Create Stripe Account"}
              </button>
            </div>
          )}

          {error && (
            <div className="integration-error" style={{ color: "#e66565", marginTop: 16 }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
