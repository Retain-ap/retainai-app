// src/components/GoogleCalendarApi.js

const API_BASE = "https://www.googleapis.com/calendar/v3";
const CALENDAR_ID = "primary";

// Get Google Calendar events for a date range
export async function getGoogleEvents(token, start, end) {
  if (!token) return [];
  const url = `${API_BASE}/calendars/${CALENDAR_ID}/events?timeMin=${start}&timeMax=${end}&singleEvents=true&orderBy=startTime`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.items || [];
}

// Add a new event to Google Calendar
export async function addGoogleEvent(token, { title, start, end, description, location }) {
  if (!token) throw new Error("No token");
  const event = {
    summary: title,
    description,
    location,
    start: { dateTime: start },
    end: { dateTime: end }
  };
  const res = await fetch(`${API_BASE}/calendars/${CALENDAR_ID}/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(event)
  });
  return await res.json();
}

// Delete a Google Calendar event
export async function deleteGoogleEvent(token, eventId) {
  if (!token || !eventId) throw new Error("Missing token or eventId");
  return await fetch(`${API_BASE}/calendars/${CALENDAR_ID}/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// Update an event (optional)
export async function updateGoogleEvent(token, eventId, update) {
  if (!token || !eventId) throw new Error("Missing token or eventId");
  return await fetch(`${API_BASE}/calendars/${CALENDAR_ID}/events/${eventId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(update)
  });
}
