// src/components/GoogleCalendarApi.js

/**
 * Lightweight Google Calendar REST helpers (via fetch)
 * ---------------------------------------------------
 * - Token: pass a valid OAuth2 access token (string) to each call
 * - Calendar: defaults to the user's "primary" calendar; override with { calendarId }
 * - Time: accepts Date or ISO strings; converted to RFC3339 automatically
 * - Resilient: basic error handling + pagination + optional retries for rate limits
 */

const API_BASE = "https://www.googleapis.com/calendar/v3";
const DEFAULT_CALENDAR_ID = "primary";
const DEFAULT_TZ =
  (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

/* ---------------- utils ---------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toRFC3339(value) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  // if already RFC3339-ish, let it pass; otherwise attempt parse
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function buildQuery(params = {}) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) =>
      Array.isArray(v)
        ? v.map((x) => `${encodeURIComponent(k)}=${encodeURIComponent(x)}`).join("&")
        : `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
    )
    .filter(Boolean)
    .join("&");
  return q ? `?${q}` : "";
}

async function jfetch(
  url,
  {
    method = "GET",
    token,
    headers = {},
    body,
    retries = 1, // basic retry on rate limits
    signal,
  } = {}
) {
  const hdrs = {
    Accept: "application/json",
    ...headers,
  };
  if (token) hdrs.Authorization = `Bearer ${token}`;
  if (body) hdrs["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers: hdrs,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  let data = null;
  try {
    // 204 will have no body
    if (res.status !== 204) data = await res.json();
  } catch {
    // ignore parse errors (some DELETEs return empty bodies)
  }

  if (!res.ok) {
    const reason =
      (data &&
        (data.error?.message ||
          data.error ||
          data.message)) ||
      `${res.status} ${res.statusText}`;

    // naive retry on rate limits
    const isRateLimit =
      res.status === 429 ||
      (res.status === 403 &&
        (data?.error?.errors || []).some((e) =>
          String(e?.reason || "").includes("rateLimitExceeded")
        ));

    if (retries > 0 && isRateLimit) {
      await sleep(400 + Math.random() * 400);
      return jfetch(url, { method, token, headers, body, retries: retries - 1, signal });
    }

    const err = new Error(reason);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data ?? {};
}

/* ---------------- events ---------------- */

/**
 * Get events in a time range.
 *
 * @param {string} token                 OAuth2 access token
 * @param {string|Date|object} start     ISO string or Date, or options object
 * @param {string|Date} [end]            ISO string or Date
 * @param {object} [opts]                Optional options if start/end provided separately
 *   - calendarId   : string (default "primary")
 *   - timeZone     : string (IANA tz, default local)
 *   - maxResults   : number (page size, default 250)
 *   - query        : string (free-text search q=)
 *   - singleEvents : boolean (default true; orders by startTime)
 *   - signal       : AbortSignal
 */
export async function getGoogleEvents(token, start, end, opts = {}) {
  // Overload: if "start" is object, treat it as options
  const options = (start && typeof start === "object" && !(start instanceof Date))
    ? start
    : { start, end, ...opts };

  const {
    calendarId = DEFAULT_CALENDAR_ID,
    timeZone = DEFAULT_TZ,
    maxResults = 250,
    query,
    singleEvents = true,
    signal,
  } = options;

  const timeMin = toRFC3339(options.start);
  const timeMax = toRFC3339(options.end);

  const base = `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
  let pageToken;
  const out = [];

  do {
    const qs = buildQuery({
      timeMin,
      timeMax,
      timeZone,               // allows server to interpret times accordingly
      singleEvents,           // expand recurring
      orderBy: singleEvents ? "startTime" : undefined,
      maxResults,
      pageToken,
      q: query,
    });

    const data = await jfetch(`${base}${qs}`, { token, signal });
    const items = Array.isArray(data.items) ? data.items : [];
    out.push(...items);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return out;
}

/**
 * Add a new event.
 *
 * @param {string} token
 * @param {object} payload
 *   - title        : string (summary)
 *   - start        : Date|string (RFC3339) or "YYYY-MM-DD" when allDay=true
 *   - end          : Date|string (RFC3339) or "YYYY-MM-DD" (defaults to +30m if not provided and not allDay)
 *   - description  : string
 *   - location     : string
 *   - attendees    : [{email, displayName}]
 *   - reminders    : { useDefault?: boolean, overrides?: [{method, minutes}] }
 *   - colorId      : string
 *   - allDay       : boolean (uses start.date / end.date)
 *   - createMeet   : boolean (create Google Meet link)
 *   - sendUpdates  : "all"|"externalOnly"|"none" (default "all")
 *   - calendarId   : string (default "primary")
 *   - timeZone     : string (default local tz)
 *   - visibility   : "default"|"public"|"private"|"confidential"
 * @returns created event object
 */
export async function addGoogleEvent(
  token,
  {
    title,
    start,
    end,
    description,
    location,
    attendees,
    reminders,
    colorId,
    allDay = false,
    createMeet = false,
    sendUpdates = "all",
    calendarId = DEFAULT_CALENDAR_ID,
    timeZone = DEFAULT_TZ,
    visibility,
  }
) {
  if (!token) throw new Error("No token provided");

  let startObj, endObj;

  if (allDay) {
    // Expect plain dates like "2025-01-31". end date is exclusive per Google.
    const startDate = typeof start === "string" ? start.slice(0, 10) : toRFC3339(start).slice(0, 10);
    const endDate =
      end
        ? (typeof end === "string" ? end.slice(0, 10) : toRFC3339(end).slice(0, 10))
        : startDate;
    // add 1 day to end for all-day single-day convenience
    const endDateExclusive = end ? endDate : addDaysISO(startDate, 1);

    startObj = { date: startDate };
    endObj = { date: endDateExclusive };
  } else {
    const startISO = toRFC3339(start);
    const endISO = end ? toRFC3339(end) : addMinutesISO(startISO, 30);
    startObj = { dateTime: startISO, timeZone };
    endObj = { dateTime: endISO, timeZone };
  }

  const body = {
    summary: title,
    description,
    location,
    start: startObj,
    end: endObj,
    attendees,
    reminders,
    colorId,
    visibility,
  };

  // Request a Meet link
  const query = buildQuery({ sendUpdates, conferenceDataVersion: createMeet ? 1 : undefined });
  if (createMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `req-${Date.now().toString(36)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const url = `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events${query}`;
  return jfetch(url, { method: "POST", token, body });
}

/**
 * Delete an event by ID.
 *
 * @param {string} token
 * @param {string} eventId
 * @param {object} [opts]
 *   - calendarId  : string
 *   - sendUpdates : "all"|"externalOnly"|"none"
 * @returns {boolean} true on success
 */
export async function deleteGoogleEvent(token, eventId, opts = {}) {
  if (!token || !eventId) throw new Error("Missing token or eventId");
  const { calendarId = DEFAULT_CALENDAR_ID, sendUpdates = "all" } = opts;
  const qs = buildQuery({ sendUpdates });
  const url = `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}${qs}`;
  await jfetch(url, { method: "DELETE", token });
  return true;
}

/**
 * Patch (update) an event.
 *
 * @param {string} token
 * @param {string} eventId
 * @param {object} update                 (fields per Google API)
 * @param {object} [opts]
 *   - calendarId  : string
 *   - sendUpdates : "all"|"externalOnly"|"none"
 *   - ifMatchEtag : string (optimistic concurrency)
 */
export async function updateGoogleEvent(token, eventId, update, opts = {}) {
  if (!token || !eventId) throw new Error("Missing token or eventId");
  const { calendarId = DEFAULT_CALENDAR_ID, sendUpdates = "all", ifMatchEtag } = opts;

  // Normalize time objects if plain strings/Dates were passed
  const normalized = { ...update };
  if (update.start && (typeof update.start === "string" || update.start instanceof Date)) {
    normalized.start = { dateTime: toRFC3339(update.start), timeZone: update.timeZone || DEFAULT_TZ };
  }
  if (update.end && (typeof update.end === "string" || update.end instanceof Date)) {
    normalized.end = { dateTime: toRFC3339(update.end), timeZone: update.timeZone || DEFAULT_TZ };
  }

  const qs = buildQuery({ sendUpdates });
  const headers = {};
  if (ifMatchEtag) headers["If-Match"] = ifMatchEtag;

  const url = `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}${qs}`;
  return jfetch(url, { method: "PATCH", token, body: normalized, headers });
}

/* ---------------- helpers (dates) ---------------- */

function addMinutesISO(iso, minutes = 30) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + Number(minutes || 0));
  return d.toISOString();
}

function addDaysISO(yyyyMMdd, days = 1) {
  const [y, m, d] = yyyyMMdd.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/* ---------------- optional: simple search helper ---------------- */
/**
 * Find events with a free-text query within an optional time window.
 * @param {string} token
 * @param {object} opts same as getGoogleEvents but "query" is required or useful
 */
export async function searchGoogleEvents(token, opts = {}) {
  if (!opts.query) throw new Error("searchGoogleEvents requires { query }");
  return getGoogleEvents(token, { ...opts });
}
