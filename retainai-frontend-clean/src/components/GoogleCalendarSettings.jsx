// src/components/GoogleCalendarSettings.jsx
import React, { useState, useEffect, useMemo } from "react";
import { useGoogleLogin, googleLogout } from "@react-oauth/google";

/* === Local storage keys === */
const TOKEN_KEY = "gcal_token";
const NOTIF_PREF_KEY = "notification_prefs";

/* === Defaults === */
const DEFAULT_PREFS = {
  reminders: true,
  aiSuggestions: true,
  dailySummary: false,
};

export default function GoogleCalendarSettings({ onEventsFetched = () => {} }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(NOTIF_PREF_KEY)) || DEFAULT_PREFS;
    } catch {
      return DEFAULT_PREFS;
    }
  });
  const [lastSyncAt, setLastSyncAt] = useState("");

  /* Google login with Calendar readonly scope */
  const login = useGoogleLogin({
    onSuccess: (resp) => {
      const accessToken = resp?.access_token || "";
      if (!accessToken) {
        setError("Could not obtain Google access token.");
        return;
      }
      setToken(accessToken);
      localStorage.setItem(TOKEN_KEY, accessToken);
    },
    onError: () => setError("Google login failed."),
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    flow: "implicit",
  });

  const isConnected = useMemo(() => Boolean(token), [token]);

  const handleLogout = () => {
    try {
      googleLogout();
    } catch {
      /* ignore */
    }
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    setEvents([]);
    setError("");
    setLastSyncAt("");
    onEventsFetched([]);
  };

  /* Fetch Google Calendar events for the next 30 days */
  const fetchEvents = async (accessToken) => {
    if (!accessToken) return;
    setLoading(true);
    setError("");

    const now = new Date().toISOString();
    const max = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const url =
      `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
      `?timeMin=${encodeURIComponent(now)}` +
      `&timeMax=${encodeURIComponent(max)}` +
      `&singleEvents=true&orderBy=startTime`;

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();

      if (!res.ok || data?.error) {
        const code = data?.error?.code || res.status;
        const message = data?.error?.message || res.statusText || "Error fetching events.";
        setError(`${code}: ${message}`);
        setEvents([]);
        onEventsFetched([]);

        // Expired/invalid token → sign out
        if (code === 401 || code === 403) handleLogout();
      } else {
        const items = Array.isArray(data.items) ? data.items : [];
        setEvents(items);
        setLastSyncAt(new Date().toLocaleString());
        onEventsFetched(items);
      }
    } catch (e) {
      setError("Network error: " + (e?.message || "Unknown"));
      setEvents([]);
      onEventsFetched([]);
    } finally {
      setLoading(false);
    }
  };

  /* Auto fetch on mount if token exists */
  useEffect(() => {
    if (token) fetchEvents(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /* Persist notification preferences */
  const handlePrefChange = (patch) => {
    const next = { ...notifPrefs, ...patch };
    setNotifPrefs(next);
    localStorage.setItem(NOTIF_PREF_KEY, JSON.stringify(next));
  };

  /* --- UI --- */
  return (
    <div
      style={{
        padding: 30,
        maxWidth: 700,
        margin: "0 auto",
        color: "#f7cb53",
      }}
    >
      <h2 style={{ fontWeight: "bold", fontSize: "1.6em", marginBottom: 15 }}>
        Settings
      </h2>

      {/* --- Google Calendar Integration --- */}
      <div
        style={{
          background: "#232323",
          borderRadius: 13,
          padding: "24px 22px",
          marginBottom: 28,
          boxShadow: "0 2px 22px #0006",
          border: "1px solid #2a2a2a",
        }}
      >
        <h3 style={{ color: "#f7cb53", fontWeight: 700, fontSize: "1.25em" }}>
          Google Calendar Integration
        </h3>

        {!isConnected ? (
          <div>
            <button
              onClick={() => login()}
              disabled={loading}
              style={{
                background: "#f7cb53",
                color: "#191919",
                border: "none",
                borderRadius: 10,
                fontWeight: 800,
                padding: "14px 26px",
                fontSize: "1.08em",
                marginTop: 16,
                cursor: "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Connecting…" : "Connect Google Calendar"}
            </button>
            {error && (
              <div
                style={{
                  color: "#ff6565",
                  background: "#1c1c1c",
                  border: "1px solid #3a1111",
                  borderRadius: 10,
                  padding: 12,
                  marginTop: 14,
                  fontWeight: 700,
                }}
              >
                {error}
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={handleLogout}
                disabled={loading}
                style={{
                  background: "#191919",
                  color: "#f7cb53",
                  border: "1.5px solid #f7cb53",
                  borderRadius: 10,
                  fontWeight: 800,
                  padding: "10px 18px",
                  cursor: "pointer",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                Disconnect Google
              </button>
              <button
                onClick={() => fetchEvents(token)}
                disabled={loading}
                style={{
                  background: "#f7cb53",
                  color: "#191919",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 800,
                  padding: "10px 18px",
                  cursor: "pointer",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Refreshing…" : "Refresh Events"}
              </button>
            </div>

            {error && (
              <div
                style={{
                  color: "#ff6565",
                  background: "#1c1c1c",
                  border: "1px solid #3a1111",
                  borderRadius: 10,
                  padding: 12,
                  marginTop: 14,
                  fontWeight: 700,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ marginTop: 14, color: "#fff", fontSize: "1.03em" }}>
              Synced{" "}
              <span style={{ fontWeight: 800, color: "#b6e355" }}>
                {events.length}
              </span>{" "}
              event{events.length === 1 ? "" : "s"} from your Google Calendar.
              {lastSyncAt && (
                <span style={{ color: "#9fb0bb", marginLeft: 8 }}>
                  (Last sync: {lastSyncAt})
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* --- Notification Preferences --- */}
      <div
        style={{
          background: "#232323",
          borderRadius: 13,
          padding: "24px 22px",
          boxShadow: "0 2px 22px #0006",
          border: "1px solid #2a2a2a",
        }}
      >
        <h3 style={{ color: "#f7cb53", fontWeight: 700, fontSize: "1.22em" }}>
          Notification Preferences
        </h3>

        <form style={{ marginTop: 12, color: "#e9edef" }}>
          <label style={{ display: "block", marginBottom: 12, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={!!notifPrefs.reminders}
              onChange={(e) => handlePrefChange({ reminders: e.target.checked })}
              style={{ marginRight: 10 }}
            />
            Reminders about cold leads
          </label>

          <label style={{ display: "block", marginBottom: 12, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={!!notifPrefs.aiSuggestions}
              onChange={(e) =>
                handlePrefChange({ aiSuggestions: e.target.checked })
              }
              style={{ marginRight: 10 }}
            />
            AI follow-up suggestions
          </label>

          <label style={{ display: "block", marginBottom: 12, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={!!notifPrefs.dailySummary}
              onChange={(e) =>
                handlePrefChange({ dailySummary: e.target.checked })
              }
              style={{ marginRight: 10 }}
            />
            Daily summary emails
          </label>
        </form>
      </div>
    </div>
  );
}
