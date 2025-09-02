// src/components/Calendar.jsx
import React, { useEffect, useMemo, useState } from "react";

/* === THEME (aligned with Analytics) === */
const BG = "#181a1b";
const CARD = "#232323";
const BORDER = "#2a3942";
const TEXT = "#e9edef";
const SUBTEXT = "#9fb0bb";
const GOLD = "#ffd966";

const APPT = "#30b46c";
const NOTE = "#ffd966";
const GOOGLE = "#4885ed";

/* --- Helpers --- */
function getLocalISO(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function getCalendarGrid(year, month) {
  const first = new Date(year, month, 1);
  const daysIn = new Date(year, month + 1, 0).getDate();
  const start = first.getDay();
  const days = [];
  for (let i = 0; i < start; i++) days.push(null);
  for (let d = 1; d <= daysIn; d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);
  while (days.length < 42) days.push(null);
  return days;
}

/* === Local storage keys (shared with Appointments) === */
const LS_KEYS = (email) => ({
  hidden: `appt_hidden_${email || "anon"}`,
  done: `appt_done_${email || "anon"}`,
  time: `appt_time_${email || "anon"}`,
  slots: `appt_slots_${email || "anon"}`
});
const loadJSON = (k, fallback = {}) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};
const saveJSON = (k, obj) => {
  try {
    localStorage.setItem(k, JSON.stringify(obj || {}));
  } catch {}
};

/** Match Appointments.jsx RID logic */
const getRealIdField = (r) =>
  r?.id ??
  r?._id ??
  r?.appointment_id ??
  r?.appointmentId ??
  r?.appointmentID ??
  r?.record_id ??
  r?.recordId ??
  r?.aid ??
  r?.uuid ??
  null;
const safe = (v) => (v == null ? "" : String(v));
const sigOf = (r) =>
  [
    safe(r.lead_id ?? r.lead_email ?? r.lead_first_name ?? ""),
    safe(r.appointment_time ?? ""),
    safe(r.title ?? ""),
    safe(r.notes ?? "")
  ].join("|");
const stableKey = (r) =>
  [sigOf(r), safe(r.created_at || r.updated_at || r.appointment_time || ""), safe(r.title || "")].join("~");
const hasRealId = (r) => Boolean(getRealIdField(r));
const getRID = (r) => String(r?._rid ?? r?._client_uid ?? getRealIdField(r) ?? "");

/** Assign stable client RIDs using the same slot map as Appointments.jsx */
function assignStableRIDs(rows, slotMap) {
  const copy = rows.map((r) => ({ ...r }));
  copy.sort((a, b) => {
    const ka = stableKey(a);
    const kb = stableKey(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  });

  const bySig = new Map();
  copy.forEach((r) => {
    const sig = hasRealId(r) ? `REAL:${getRealIdField(r)}` : `SIG:${sigOf(r)}`;
    if (!bySig.has(sig)) bySig.set(sig, []);
    bySig.get(sig).push(r);
  });

  const uuid = () =>
    "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const n = (Math.random() * 16) | 0;
      const v = c === "x" ? n : (n & 0x3) | 0x8;
      return v.toString(16);
    });

  bySig.forEach((groupRows, sig) => {
    if (sig.startsWith("REAL:")) {
      groupRows.forEach((r) => {
        r._rid = String(getRealIdField(r));
      });
      return;
    }
    const key = sig.slice(4);
    const slots = Array.isArray(slotMap[key]) ? [...slotMap[key]] : [];
    while (slots.length < groupRows.length) slots.push(uuid());
    groupRows.forEach((r, i) => {
      r._rid = slots[i];
      r._client_uid = slots[i];
    });
    slotMap[key] = slots;
  });

  return copy;
}

/** Apply overrides (hide, done flag, rescheduled time) */
function applyOverrides(rows = [], email) {
  const K = LS_KEYS(email);
  const hidden = loadJSON(K.hidden, {});
  const doneMap = loadJSON(K.done, {});
  const timeMap = loadJSON(K.time, {});

  return (rows || [])
    .map((r) => {
      const id = getRID(r);
      if (!id) return r;
      let out = r;
      if (timeMap[id]) out = { ...out, appointment_time: timeMap[id] };
      if (typeof doneMap[id] === "boolean") out = { ...out, done: doneMap[id] };
      return out;
    })
    .filter((r) => !hidden[getRID(r)]);
}

// Normalize backend appointment using LOCAL time
function normalizeAppt(appt) {
  if (!appt?.appointment_time) return null;
  const dt = new Date(appt.appointment_time);
  if (isNaN(dt)) return null;

  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");

  return {
    type: "appointment",
    date: `${y}-${m}-${d}`,
    time: `${hh}:${mm}`,
    title: appt.title || appt.lead_first_name || appt.business_name || "Appointment",
    notes: appt.notes || "",
    ...appt
  };
}

function getCellEvents(dateObj, events, leads, googleEvents, appointments) {
  const dayISO = getLocalISO(dateObj);
  const cellEvents = [];

  (leads || []).forEach((lead) =>
    (lead.appointments || []).forEach((app) => {
      if (app.date === dayISO) cellEvents.push({ type: "appointment", ...app });
    })
  );

  (events || []).forEach((ev) => {
    if (ev.date === dayISO) cellEvents.push({ type: "note", ...ev });
  });

  (googleEvents || []).forEach((ev) => {
    const evStart = ev.start?.dateTime || ev.start?.date;
    if (evStart && evStart.slice(0, 10) === dayISO)
      cellEvents.push({ type: "google", google: ev });
  });

  (appointments || []).forEach((a) => {
    const norm = normalizeAppt(a);
    if (norm && norm.date === dayISO) cellEvents.push(norm);
  });

  return cellEvents;
}

function getPanelEvents(dateObj, events, leads, googleEvents, appointments) {
  if (!dateObj) return [];
  const dayISO = getLocalISO(dateObj);
  const out = [];

  (leads || []).forEach((lead) =>
    (lead.appointments || []).forEach((app) => {
      if (app.date === dayISO) out.push({ type: "appointment", ...app, lead });
    })
  );

  (events || []).forEach((ev) => {
    if (ev.date === dayISO) out.push({ type: "note", ...ev });
  });

  (googleEvents || []).forEach((ev) => {
    const s = ev.start?.dateTime || ev.start?.date;
    if (s && s.slice(0, 10) === dayISO) out.push({ type: "google", google: ev });
  });

  (appointments || []).forEach((a) => {
    const norm = normalizeAppt(a);
    if (norm && norm.date === dayISO) out.push(norm);
  });

  (leads || []).forEach((lead) => {
    if (lead.birthday && lead.birthday.slice(5) === dayISO.slice(5))
      out.push({ type: "birthday", lead });
  });

  return out;
}

function formatGoogleEventTime(ev) {
  if (ev.start?.dateTime) {
    const s = new Date(ev.start.dateTime);
    if (ev.end?.dateTime) {
      const e = new Date(ev.end.dateTime);
      return `${s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${e.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })}`;
    }
    return s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return ev.start?.date || "";
}

/* tiny count pill for day cells */
function CountPill({ color, count, title }) {
  if (!count) return null;
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 16,
        height: 16,
        padding: "0 4px",
        borderRadius: 8,
        fontSize: 10,
        fontWeight: 900,
        background: color,
        color: "#111"
      }}
    >
      {count}
    </span>
  );
}

export default function Calendar({
  user, // <-- pass current user object
  leads = [],
  googleEvents = [],
  selectedDate,
  setSelectedDate
}) {
  const API = process.env.REACT_APP_API_URL;
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [addEventDate, setAddEventDate] = useState(null);
  const [events, setEvents] = useState([]);

  // backend appointments
  const [appointments, setAppointments] = useState([]);

  // share the same RID slot map with Appointments.jsx
  const [slotMap, setSlotMap] = useState({});

  // bump when overrides change (so we recompute without re-fetch)
  const [overrideBump, setOverrideBump] = useState(0);

  const fetchAppointments = async () => {
    if (!API || !user?.email) return;
    try {
      const r = await fetch(`${API}/api/appointments/${encodeURIComponent(user.email)}`);
      const j = await r.json();
      setAppointments(Array.isArray(j?.appointments) ? j.appointments : []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    // load slot map for this user
    setSlotMap(loadJSON(LS_KEYS(user?.email).slots, {}));
  }, [user?.email]);

  useEffect(() => {
    fetchAppointments();
    const onChanged = () => fetchAppointments();
    const onOverrides = () => setOverrideBump((x) => x + 1);
    window.addEventListener("appointments:changed", onChanged);
    window.addEventListener("appointments:overrides-updated", onOverrides);
    return () => {
      window.removeEventListener("appointments:changed", onChanged);
      window.removeEventListener("appointments:overrides-updated", onOverrides);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API, user?.email]);

  // assign the SAME stable RIDs as Appointments.jsx and persist if extended
  const withStableRIDs = useMemo(() => {
    const nextSlots = { ...slotMap };
    const rows = assignStableRIDs(appointments || [], nextSlots);
    if (JSON.stringify(nextSlots) !== JSON.stringify(slotMap)) {
      setSlotMap(nextSlots);
      saveJSON(LS_KEYS(user?.email).slots, nextSlots);
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments]);

  // apply overrides (hide/done/time) before rendering
  const effectiveAppointments = useMemo(
    () => applyOverrides(withStableRIDs, user?.email),
    [withStableRIDs, user?.email, overrideBump]
  );

  const calendarGrid = useMemo(() => getCalendarGrid(year, month), [year, month]);
  const currMonthStr = new Date(year, month).toLocaleString("default", { month: "long", year: "numeric" });
  const dayEvents = useMemo(
    () => getPanelEvents(selectedDate, events, leads, googleEvents, effectiveAppointments),
    [selectedDate, events, leads, googleEvents, effectiveAppointments]
  );

  function changeMonth(delta) {
    let m = month + delta;
    let y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m);
    setYear(y);
    setSelectedDate && setSelectedDate(null);
  }

  function handleAddEventClick(dateObj) {
    setAddEventDate(dateObj);
    setShowAddEvent(true);
    setSelectedDate && setSelectedDate(dateObj);
  }
  function handleAddEventSave(newEvent) {
    setEvents((prev) => [
      ...prev,
      { title: newEvent.title, date: getLocalISO(addEventDate), time: newEvent.time, notes: newEvent.notes }
    ]);
    setShowAddEvent(false);
    setAddEventDate(null);
  }
  function handleCellClick(day) {
    if (day) setSelectedDate && setSelectedDate(day);
  }

  return (
    <div style={{ padding: "28px", background: BG, minHeight: "100vh", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
        {/* Calendar card */}
        <div
          style={{
            background: CARD,
            padding: 22,
            borderRadius: 18,
            minWidth: 630,
            flex: "0 0 650px",
            border: `1px solid ${BORDER}`,
            boxShadow: "0 2px 28px rgba(0,0,0,0.35)"
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontWeight: 900, fontSize: 22, color: TEXT }}>Calendar</span>
            <div>
              <button onClick={() => changeMonth(-1)} style={monthBtnStyle}>&lt;</button>
              <span style={{ fontSize: 18, fontWeight: 900, color: GOLD, margin: "0 14px" }}>{currMonthStr}</span>
              <button onClick={() => changeMonth(1)} style={monthBtnStyle}>&gt;</button>
            </div>
          </div>

          {/* DOW */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 8,
              width: "100%",
              marginBottom: 6
            }}
          >
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} style={{ textAlign: "center", color: GOLD, fontWeight: 900, fontSize: 14 }}>
                {d}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 8,
              width: "100%",
              minHeight: 420
            }}
          >
            {calendarGrid.map((d, i) => {
              if (!d) return <div key={i} />;
              const isToday = d.toDateString() === today.toDateString();
              const isSelected = selectedDate && d.toDateString() === selectedDate.toDateString();

              const evs = getCellEvents(d, events, leads, googleEvents, effectiveAppointments);
              const counts = evs.reduce(
                (acc, e) => {
                  acc[e.type] = (acc[e.type] || 0) + 1;
                  return acc;
                },
                { appointment: 0, google: 0, note: 0 }
              );

              const tooltip = [
                counts.appointment ? `${counts.appointment} appointment${counts.appointment > 1 ? "s" : ""}` : null,
                counts.google ? `${counts.google} Google` : null,
                counts.note ? `${counts.note} note${counts.note > 1 ? "s" : ""}` : null
              ]
                .filter(Boolean)
                .join(" • ");

              return (
                <div
                  key={`${d.getTime()}-${i}`}
                  onClick={() => handleCellClick(d)}
                  title={tooltip}
                  style={{
                    minHeight: 56,
                    borderRadius: 12,
                    border: isSelected ? `2px solid ${GOLD}` : isToday ? `2px solid ${TEXT}` : `1px solid ${BORDER}`,
                    background: isSelected ? "#1e2326" : BG,
                    textAlign: "center",
                    cursor: "pointer",
                    paddingTop: 6,
                    boxShadow: isSelected ? "0 2px 16px rgba(255,217,102,0.25)" : ""
                  }}
                >
                  <div style={{ color: isSelected ? GOLD : TEXT, fontWeight: 900, fontSize: 14, marginBottom: 6 }}>
                    {d.getDate()}
                  </div>

                  {/* compact count pills (no overflow) */}
                  <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
                    <CountPill color={APPT} count={counts.appointment} title="Appointments" />
                    <CountPill color={GOOGLE} count={counts.google} title="Google events" />
                    <CountPill color={NOTE} count={counts.note} title="Notes" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 16, marginTop: 14, alignItems: "center", color: SUBTEXT, fontWeight: 800 }}>
            <LegendDot color={APPT} label="Appointment" />
            <LegendDot color={NOTE} label="Note" />
            <LegendDot color={GOOGLE} label="Google" outlined />
          </div>
        </div>

        {/* Right panel */}
        <div
          style={{
            flex: 1,
            minWidth: 360,
            background: CARD,
            borderRadius: 18,
            padding: "22px 20px",
            color: TEXT,
            border: `1px solid ${BORDER}`,
            boxShadow: "0 2px 28px rgba(0,0,0,0.35)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <h3 style={{ fontWeight: 900, fontSize: 18, color: GOLD, margin: 0 }}>
              {selectedDate
                ? selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
                : "Select a date"}
            </h3>
            {selectedDate && (
              <button
                style={{
                  background: GOLD,
                  color: "#191a1d",
                  fontWeight: 900,
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 14px",
                  cursor: "pointer",
                  boxShadow: "0 1.5px 8px rgba(255,217,102,0.3)"
                }}
                onClick={() => handleAddEventClick(selectedDate)}
              >
                + Add Event
              </button>
            )}
          </div>

          {(!dayEvents || dayEvents.length === 0) && (
            <div
              style={{
                color: TEXT,
                background: "#191919",
                borderRadius: 10,
                padding: 14,
                marginBottom: 14,
                fontWeight: 700,
                border: `1px solid ${BORDER}`
              }}
            >
              No events for this day.
            </div>
          )}

          {dayEvents.map((ev, i) => (
            <div
              key={i}
              style={{
                background: "#191919",
                borderRadius: 12,
                marginBottom: 12,
                padding: 14,
                display: "flex",
                alignItems: "center",
                gap: 12,
                borderLeft: `6px solid ${ev.type === "appointment" ? APPT : ev.type === "google" ? GOOGLE : NOTE}`,
                border: `1px solid ${BORDER}`
              }}
            >
              <span
                style={{
                  fontSize: 24,
                  color: ev.type === "appointment" ? APPT : ev.type === "google" ? GOOGLE : NOTE
                }}
              >
                {ev.type === "birthday"
                  ? "🎂"
                  : ev.type === "google"
                  ? "🗓️"
                  : ev.type === "note"
                  ? "📝"
                  : "📅"}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ color: TEXT, fontWeight: 900 }}>
                  {ev.title || ev.google?.summary || ev.lead?.name}
                </div>
                <div style={{ color: GOLD, fontWeight: 800, marginTop: 2 }}>
                  {ev.type === "birthday"
                    ? "Birthday"
                    : ev.type === "google"
                    ? formatGoogleEventTime(ev.google)
                    : ev.time
                    ? `${ev.date} ${ev.time}`
                    : ev.date}
                </div>
                {ev.notes && <div style={{ color: SUBTEXT, fontSize: 14 }}>{ev.notes}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showAddEvent && (
        <AddEventModal onSave={handleAddEventSave} onClose={() => setShowAddEvent(false)} date={addEventDate} />
      )}
    </div>
  );
}

/* Legend chip */
function LegendDot({ color, label, outlined }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: color,
          outline: outlined ? `2px solid ${color}` : "none"
        }}
      />
      <span style={{ color: SUBTEXT, fontWeight: 800, fontSize: 12 }}>{label}</span>
    </div>
  );
}

/* Add Event Modal (notes only) */
function AddEventModal({ onSave, onClose, date }) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000a",
        zIndex: 99,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <div
        style={{
          background: CARD,
          borderRadius: 18,
          padding: "26px 24px",
          minWidth: 360,
          maxWidth: 520,
          width: "92%",
          boxShadow: "0 2px 22px rgba(0,0,0,0.5)",
          border: `2px solid ${GOLD}`
        }}
      >
        <h3 style={{ color: GOLD, fontWeight: 900, marginBottom: 14 }}>
          Add Event ({date?.toLocaleDateString()})
        </h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ title, time, notes });
          }}
        >
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
              placeholder="Event Title"
              required
            />
          </Field>
          <Field label="Time">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Notes">
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ ...inputStyle, resize: "vertical" }}
              placeholder="Event Notes"
            />
          </Field>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button
              type="submit"
              style={{
                background: GOLD,
                color: "#232323",
                fontWeight: 900,
                border: "none",
                borderRadius: 8,
                padding: "11px 16px",
                cursor: "pointer",
                flex: 1
              }}
            >
              Add
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                color: TEXT,
                fontWeight: 900,
                border: `1.3px solid ${GOLD}`,
                borderRadius: 8,
                padding: "11px 16px",
                cursor: "pointer",
                flex: 1
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* Shared UI bits */
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ color: TEXT, marginRight: 8, fontWeight: 900 }}>{label}:</label>
      {children}
    </div>
  );
}

const inputStyle = {
  padding: "10px 12px",
  borderRadius: 8,
  fontWeight: 700,
  fontSize: "1.02em",
  background: BG,
  color: TEXT,
  border: `1.5px solid ${BORDER}`,
  width: "100%"
};

const monthBtnStyle = {
  background: CARD,
  color: GOLD,
  border: `1.5px solid ${BORDER}`,
  borderRadius: 8,
  padding: "8px 14px",
  fontWeight: 900,
  fontSize: "1.02em",
  cursor: "pointer"
};
