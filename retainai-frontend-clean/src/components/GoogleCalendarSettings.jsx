import React, { useState, useEffect } from "react";
import { useGoogleLogin, googleLogout } from "@react-oauth/google";

// Local storage keys
const TOKEN_KEY = "gcal_token";
const NOTIF_PREF_KEY = "notification_prefs";

const DEFAULT_PREFS = {
  reminders: true,
  aiSuggestions: true,
  dailySummary: false,
};

export default function GoogleCalendarSettings({ onEventsFetched }) {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [notifPrefs, setNotifPrefs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(NOTIF_PREF_KEY)) || DEFAULT_PREFS;
    } catch {
      return DEFAULT_PREFS;
    }
  });

  // Google login with calendar scope
  const login = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      setToken(tokenResponse.access_token);
      localStorage.setItem(TOKEN_KEY, tokenResponse.access_token);
    },
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    flow: "implicit",
  });

  const handleLogout = () => {
    googleLogout();
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    setEvents([]);
    setError("");
    onEventsFetched([]);
  };

  // Fetch Google Calendar events (30 days ahead)
  const fetchEvents = async (accessToken) => {
    setError("");
    const now = new Date().toISOString();
    const max = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&timeMax=${max}&singleEvents=true&orderBy=startTime`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (data.error) {
        setError(`${data.error.code}: ${data.error.message}`);
        setEvents([]);
        if (data.error.code === 401 || data.error.code === 403) {
          handleLogout();
        }
      } else {
        setEvents(data.items || []);
        onEventsFetched(data.items || []);
      }
    } catch (err) {
      setError("Unknown error: " + err.message);
      setEvents([]);
      onEventsFetched([]);
    }
  };

  // Fetch events on mount/login
  useEffect(() => {
    if (token) fetchEvents(token);
    // eslint-disable-next-line
  }, [token]);

  // Save notification prefs to localStorage
  const handlePrefChange = (newPrefs) => {
    setNotifPrefs(newPrefs);
    localStorage.setItem(NOTIF_PREF_KEY, JSON.stringify(newPrefs));
  };

  return (
    <div style={{
      padding: "30px",
      maxWidth: 650,
      margin: "0 auto",
      color: "#f7cb53"
    }}>
      <h2 style={{ fontWeight: "bold", fontSize: "1.6em", marginBottom: 15 }}>
        Settings
      </h2>
      {/* --- Google Calendar Integration --- */}
      <div style={{
        background: "#232323",
        borderRadius: 13,
        padding: "28px 26px 22px 26px",
        marginBottom: 32,
        boxShadow: "0 2px 22px #0006"
      }}>
        <h3 style={{ color: "#f7cb53", fontWeight: 700, fontSize: "1.25em" }}>
          Google Calendar Integration
        </h3>
        {!token ? (
          <div>
            <button
              onClick={() => login()}
              style={{
                background: "#f7cb53", color: "#191919",
                border: "none", borderRadius: 8, fontWeight: 700,
                padding: "14px 28px", fontSize: "1.13em", marginTop: "18px"
              }}
            >
              Connect Google Calendar
            </button>
          </div>
        ) : (
          <div>
            <button
              onClick={handleLogout}
              style={{
                background: "#191919", color: "#f7cb53",
                border: "1.3px solid #f7cb53", borderRadius: 8, fontWeight: 700,
                padding: "11px 25px", marginBottom: 20, marginTop: 10
              }}
            >
              Disconnect Google
            </button>
            <button
              onClick={() => fetchEvents(token)}
              style={{
                background: "#f7cb53", color: "#191919",
                border: "none", borderRadius: 8, fontWeight: 700,
                padding: "11px 25px", marginLeft: 16
              }}
            >
              Refresh Google Events
            </button>
            {error && (
              <div style={{
                color: "#ff6565", background: "#222",
                borderRadius: 8, padding: 12, margin: "18px 0"
              }}>{error}</div>
            )}
            <div style={{
              marginTop: 18, color: "#fff", fontSize: "1.07em"
            }}>
              Synced <span style={{ fontWeight: 700, color: "#b6e355" }}>{events.length}</span> events from your Google Calendar.
            </div>
          </div>
        )}
      </div>
      {/* --- Notification Preferences --- */}
      <div style={{
        background: "#232323",
        borderRadius: 13,
        padding: "28px 26px",
        marginBottom: 18,
        boxShadow: "0 2px 22px #0006"
      }}>
        <h3 style={{ color: "#f7cb53", fontWeight: 700, fontSize: "1.22em" }}>
          Notification Preferences
        </h3>
        <form style={{ marginTop: 10 }}>
          <label style={{ display: "block", marginBottom: 13 }}>
            <input
              type="checkbox"
              checked={notifPrefs.reminders}
              onChange={e => handlePrefChange({ ...notifPrefs, reminders: e.target.checked })}
              style={{ marginRight: 10 }}
            />
            Reminders about cold leads
          </label>
          <label style={{ display: "block", marginBottom: 13 }}>
            <input
              type="checkbox"
              checked={notifPrefs.aiSuggestions}
              onChange={e => handlePrefChange({ ...notifPrefs, aiSuggestions: e.target.checked })}
              style={{ marginRight: 10 }}
            />
            AI follow-up suggestions
          </label>
          <label style={{ display: "block", marginBottom: 13 }}>
            <input
              type="checkbox"
              checked={notifPrefs.dailySummary}
              onChange={e => handlePrefChange({ ...notifPrefs, dailySummary: e.target.checked })}
              style={{ marginRight: 10 }}
            />
            Daily summary emails
          </label>
        </form>
      </div>
    </div>
  );
}
