import React, { useState, useEffect, useRef } from "react";
import { SiGooglecalendar } from "react-icons/si";

// Key for storing selected calendar per user in localStorage
function getUserCalKey(email) {
  return `retainai_selected_calendar_${email}`;
}

export default function GoogleCalendarEvents({
  user,
  onEvents,
  onStatus,
  onCalendarChange,
}) {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [calendars, setCalendars] = useState([]);
  const [calendarId, setCalendarId] = useState("");
  const [error, setError] = useState("");
  const [authUrl, setAuthUrl] = useState("");
  const pollingRef = useRef();

  // On mount: check Google connection and available calendars
  useEffect(() => {
    if (!user?.email) return;
    setLoading(true);
    fetch(`/api/google/status/${encodeURIComponent(user.email)}`)
      .then(res => res.json())
      .then(data => {
        setConnected(!!data.connected);
        setCalendars(data.calendars || []);
        // Restore previously selected calendar, or default to primary
        const savedId = localStorage.getItem(getUserCalKey(user.email));
        const fallbackId =
          data.calendars?.find(c => c.primary)?.id ||
          (data.calendars?.[0]?.id ?? "");
        setCalendarId(
          savedId && data.calendars?.some(c => c.id === savedId)
            ? savedId
            : fallbackId
        );
        setError("");
        setLoading(false);
        if (onStatus) onStatus(data.connected ? "loaded" : "not_connected");
      })
      .catch(() => {
        setError("Failed to check Google connection.");
        setLoading(false);
        if (onStatus) onStatus("error");
      });
    // eslint-disable-next-line
  }, [user?.email]);

  // Save calendarId to localStorage and parent on change
  useEffect(() => {
    if (user?.email && calendarId) {
      localStorage.setItem(getUserCalKey(user.email), calendarId);
      if (onCalendarChange) onCalendarChange(calendarId); // <--- This lets Calendar tab react to changes!
    }
    // eslint-disable-next-line
  }, [calendarId, user?.email]);

  // Get Google OAuth URL
  const fetchAuthUrl = async () => {
    if (!user?.email) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/google/auth-url?user_email=${encodeURIComponent(user.email)}`);
      const data = await res.json();
      if (data.url) setAuthUrl(data.url);
      else setError("Failed to get Google auth URL.");
    } catch {
      setError("Failed to get Google auth URL.");
    }
    setLoading(false);
  };

  // Start connection popup, poll for completion
  const handleConnect = async () => {
    await fetchAuthUrl();
    if (authUrl) {
      setLoading(true);
      const popup = window.open(authUrl, "googleConnect", "width=500,height=700");
      let pollCount = 0;
      pollingRef.current = setInterval(async () => {
        pollCount++;
        if (pollCount > 60 || !popup || popup.closed) {
          clearInterval(pollingRef.current);
          setLoading(false);
          return;
        }
        try {
          const res = await fetch(`/api/google/status/${encodeURIComponent(user.email)}`);
          const data = await res.json();
          if (data.connected) {
            clearInterval(pollingRef.current);
            try { popup.close(); } catch {}
            setConnected(true);
            setCalendars(data.calendars || []);
            // Restore selection or default to primary
            const savedId = localStorage.getItem(getUserCalKey(user.email));
            const fallbackId =
              data.calendars?.find(c => c.primary)?.id ||
              (data.calendars?.[0]?.id ?? "");
            setCalendarId(
              savedId && data.calendars?.some(c => c.id === savedId)
                ? savedId
                : fallbackId
            );
            setLoading(false);
            setError("");
            if (onStatus) onStatus("loaded");
          }
        } catch {/* ignore polling errors */}
      }, 1000);
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    setLoading(true);
    setError("");
    await fetch(`/api/google/disconnect/${encodeURIComponent(user.email)}`, { method: "POST" });
    setConnected(false);
    setCalendars([]);
    setCalendarId("");
    setLoading(false);
    if (onEvents) onEvents([]);
    if (onStatus) onStatus("not_connected");
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (user?.email) localStorage.removeItem(getUserCalKey(user.email));
  };

  // Clean up polling
  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  // UI
  return (
    <div className="integration-card-inner">
      <div className="integration-center" style={{ alignItems: "center" }}>
        <SiGooglecalendar size={38} style={{ color: "#4885ed", marginBottom: 12 }} />
        <div className="integration-title" style={{ marginBottom: 3 }}>
          Google Calendar
        </div>
        <div className="integration-desc" style={{ marginBottom: 18 }}>
          Connect your Google Calendar for seamless sync.
        </div>

        {/* Controls depending on state */}
        {!connected ? (
          <>
            <button
              className="integration-btn"
              onClick={handleConnect}
              disabled={loading}
              style={{
                marginTop: 12,
                width: "100%",
                background: "#4885ed",
                color: "#fff",
                border: "none",
                boxShadow: "0 2px 7px rgba(72,133,237,0.08)"
              }}
            >
              {loading ? "Connecting…" : "Connect Google Calendar"}
            </button>
            {error && <div className="integration-error">{error}</div>}
          </>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
                width: "100%",
              }}
            >
              <span className="integration-dot" />
              <span className="integration-connected" style={{ marginRight: 10 }}>
                Connected
              </span>
              <button
                className="integration-btn"
                onClick={handleDisconnect}
                disabled={loading}
                style={{
                  marginLeft: 16,
                  minWidth: 120,
                  background: "#191919",
                  color: "#4885ed",
                  border: "2px solid #4885ed",
                  boxShadow: "none"
                }}
              >
                Disconnect
              </button>
            </div>
            {calendars.length > 0 && (
              <div style={{ width: "100%", marginBottom: 10 }}>
                <label
                  style={{
                    color: "#c8c8c8",
                    fontWeight: 500,
                    fontSize: "1em",
                    marginRight: 8,
                    display: "block",
                    textAlign: "center"
                  }}
                >
                  Calendar:
                </label>
                <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
                  <select
                    className="integration-select"
                    value={calendarId}
                    onChange={e => setCalendarId(e.target.value)}
                    style={{
                      minWidth: 240,
                      maxWidth: 330,
                      margin: "0 auto",
                      textAlign: "center"
                    }}
                  >
                    {calendars.map(cal => (
                      <option key={cal.id} value={cal.id}>
                        {cal.summary}{cal.primary ? " (Primary)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {error && <div className="integration-error">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}
