// src/components/GoogleCalendarEvents.jsx
import React, { useState, useEffect, useRef } from "react";
import { SiGooglecalendar } from "react-icons/si";

// Per-user localStorage key for selected calendar
function getUserCalKey(email) {
  return `retainai_selected_calendar_${email}`;
}

function chooseInitialCalendarId(calendars = [], savedId) {
  if (!Array.isArray(calendars) || calendars.length === 0) return "";
  if (savedId && calendars.some((c) => c.id === savedId)) return savedId;
  const primary = calendars.find((c) => c.primary);
  return (primary && primary.id) || calendars[0].id || "";
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

  const pollingRef = useRef(null);

  // Reset state when user changes
  useEffect(() => {
    if (!user?.email) {
      setConnected(false);
      setCalendars([]);
      setCalendarId("");
      setError("");
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }
  }, [user?.email]);

  // Initial status + calendars load
  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/google/status/${encodeURIComponent(user.email)}`);
        const data = await res.json();
        const isConnected = !!data.connected;
        const list = Array.isArray(data.calendars) ? data.calendars : [];
        setConnected(isConnected);
        setCalendars(list);

        const saved = localStorage.getItem(getUserCalKey(user.email));
        const initial = chooseInitialCalendarId(list, saved);
        setCalendarId(initial);

        setError("");
        if (onStatus) onStatus(isConnected ? "loaded" : "not_connected");
        if (initial && onCalendarChange) onCalendarChange(initial);
      } catch {
        setError("Failed to check Google connection.");
        if (onStatus) onStatus("error");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  // Persist selection + notify parent
  useEffect(() => {
    if (user?.email && calendarId) {
      localStorage.setItem(getUserCalKey(user.email), calendarId);
      if (onCalendarChange) onCalendarChange(calendarId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarId, user?.email]);

  // ---- Auth helpers ----
  async function fetchAuthUrl() {
    if (!user?.email) return "";
    try {
      const res = await fetch(
        `/api/google/auth-url?user_email=${encodeURIComponent(user.email)}`
      );
      const data = await res.json();
      return data?.url || "";
    } catch {
      return "";
    }
  }

  // Connect flow (popup + polling)
  const handleConnect = async () => {
    if (!user?.email) return;
    setLoading(true);
    setError("");

    const url = await fetchAuthUrl();
    if (!url) {
      setLoading(false);
      setError("Failed to get Google auth URL.");
      return;
    }

    const popup = window.open(url, "googleConnect", "width=500,height=700");
    let pollCount = 0;

    // Clean existing interval if any
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      pollCount++;
      if (pollCount > 60 || !popup || popup.closed) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(
          `/api/google/status/${encodeURIComponent(user.email)}`
        );
        const data = await res.json();
        if (data.connected) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          try {
            popup.close();
          } catch {}
          const list = Array.isArray(data.calendars) ? data.calendars : [];
          const saved = localStorage.getItem(getUserCalKey(user.email));
          const initial = chooseInitialCalendarId(list, saved);

          setConnected(true);
          setCalendars(list);
          setCalendarId(initial);
          setLoading(false);
          setError("");
          if (onStatus) onStatus("loaded");
          if (initial && onCalendarChange) onCalendarChange(initial);
        }
      } catch {
        // ignore polling errors
      }
    }, 1000);
  };

  // Disconnect
  const handleDisconnect = async () => {
    if (!user?.email) return;
    setLoading(true);
    setError("");
    try {
      await fetch(`/api/google/disconnect/${encodeURIComponent(user.email)}`, {
        method: "POST",
      });
    } catch {
      // swallow
    }
    setConnected(false);
    setCalendars([]);
    setCalendarId("");
    setLoading(false);
    if (onEvents) onEvents([]); // clear parent events
    if (onStatus) onStatus("not_connected");
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    localStorage.removeItem(getUserCalKey(user.email));
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // ---- UI ----
  return (
    <div className="integration-card-inner">
      <div className="integration-center" style={{ alignItems: "center" }}>
        <SiGooglecalendar
          size={38}
          style={{ color: "#4885ed", marginBottom: 12 }}
        />
        <div className="integration-title" style={{ marginBottom: 3 }}>
          Google Calendar
        </div>
        <div className="integration-desc" style={{ marginBottom: 18 }}>
          Connect your Google Calendar for seamless sync.
        </div>

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
                boxShadow: "0 2px 7px rgba(72,133,237,0.08)",
                opacity: loading ? 0.7 : 1,
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
              <span
                className="integration-connected"
                style={{ marginRight: 10 }}
              >
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
                  boxShadow: "none",
                  opacity: loading ? 0.7 : 1,
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
                    textAlign: "center",
                  }}
                >
                  Calendar:
                </label>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    width: "100%",
                  }}
                >
                  <select
                    className="integration-select"
                    value={calendarId}
                    onChange={(e) => setCalendarId(e.target.value)}
                    style={{
                      minWidth: 240,
                      maxWidth: 330,
                      margin: "0 auto",
                      textAlign: "center",
                    }}
                  >
                    {calendars.map((cal) => (
                      <option key={cal.id} value={cal.id}>
                        {cal.summary}
                        {cal.primary ? " (Primary)" : ""}
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
