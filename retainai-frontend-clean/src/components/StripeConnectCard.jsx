// src/components/StripeConnectCard.jsx
import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Use the deployed API or local, fallback to same-origin.
const API = process.env.REACT_APP_API_URL || window.location.origin;

export default function StripeConnectCard({ user, refreshUser }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  const isConnected = user?.stripe_connected === true;

  // --- Handle Stripe return query params ---
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (
      params.get("stripe_connected") === "1" ||
      params.get("stripe_refresh") === "1"
    ) {
      // Onboard just completed or refreshed
      if (refreshUser) refreshUser();
      params.delete("stripe_connected");
      params.delete("stripe_refresh");
      navigate(
        { pathname: location.pathname, search: params.toString() },
        { replace: true }
      );
    }
  }, [location.search, navigate, refreshUser]);

  // --- Open Stripe dashboard (Express) ---
  async function handleDashboard() {
    setLoading(true); setError("");
    try {
      const res = await fetch(
        `${API}/api/stripe/dashboard-link?user_email=${encodeURIComponent(user.email)}`
      );
      const { url, error: err } = await res.json();
      if (url) window.location.assign(url);
      else setError(err || "Could not open Stripe dashboard");
    } catch (e) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  // --- Link existing Stripe account (OAuth flow) ---
  async function handleLinkExisting() {
    setLoading(true); setError("");
    try {
      const res = await fetch(
        `${API}/api/stripe/oauth/connect?user_email=${encodeURIComponent(user.email)}`
      );
      const { url, error: err } = await res.json();
      if (url) window.location.assign(url);
      else setError(err || "Failed to link existing account");
    } catch (e) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  // --- Create new Stripe account (Express onboarding) ---
  async function handleSignup() {
    setLoading(true); setError("");
    try {
      const res = await fetch(
        `${API}/api/stripe/connect-url?user_email=${encodeURIComponent(user.email)}`
      );
      const { url, error: err } = await res.json();
      if (url) window.location.assign(url);
      else setError(err || "Failed to create account");
    } catch (e) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  // --- Disconnect Stripe (deauthorize and remove locally) ---
  async function handleDisconnect() {
    setLoading(true); setError("");
    try {
      const res = await fetch(
        `${API}/api/stripe/disconnect?user_email=${encodeURIComponent(user.email)}`,
        { method: "POST" }
      );
      if (res.ok) {
        if (refreshUser) await refreshUser();
      } else {
        const { error: err } = await res.json();
        setError(err || "Failed to disconnect");
      }
    } catch (e) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`integration-card${isConnected ? " stripe-connected" : ""}`}>
      <div style={{
        width: "100%",
        minHeight: 240,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center"
      }}>
        <span style={{ fontSize: 34, color: "#635bff", marginBottom: 12 }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7.8 4.5h8.4v2.1H11.7c-2.1 0-3.3 1.2-3.3 3s1.2 3 3.3 3H16c2.1 0 3.6 1.2 3.6 3.9 0 2.7-1.8 4.5-5.4 4.5H8.1v-2.1h6.6c1.8 0 2.7-1.2 2.7-2.7 0-1.5-.9-2.7-2.7-2.7H8.1v-2.1H16c1.8 0 3-1.2 3-2.7s-1.2-2.7-3-2.7H7.8v-2.1z" />
          </svg>
        </span>

        <div style={{ width: "100%", textAlign: "center" }}>
          <div style={{ fontWeight: 700, color: "#fff", fontSize: 20, marginBottom: 2 }}>
            Stripe Payments
          </div>
          <div style={{ color: "#aaa", fontSize: 15, margin: "2px 0 18px 0" }}>
            {isConnected
              ? "Your Stripe account is connected."
              : "Connect or create a Stripe account to accept payments."}
          </div>

          {isConnected ? (
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
              <button className="settings-btn connected" disabled>
                Connected
              </button>
              <button
                className="settings-btn"
                onClick={handleDashboard}
                disabled={loading}
              >
                {loading ? "Opening…" : "Open Stripe Dashboard"}
              </button>
              <button
                className="settings-btn refresh"
                onClick={refreshUser}
              >
                Refresh Status
              </button>
              <button
                className="settings-btn disconnect"
                onClick={handleDisconnect}
                disabled={loading}
                style={{ background: "#e66565" }}
              >
                {loading ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
              <button
                className="settings-btn"
                onClick={handleLinkExisting}
                disabled={loading}
              >
                {loading ? "Redirecting…" : "Link Existing Stripe Account"}
              </button>
              <button
                className="settings-btn"
                onClick={handleSignup}
                disabled={loading}
              >
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
