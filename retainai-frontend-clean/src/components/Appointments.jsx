// src/components/Appointments.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  FaSearch,
  FaCalendarAlt,
  FaPlus,
  FaExclamationTriangle,
  FaSun,
  FaCalendarWeek,
  FaForward
} from "react-icons/fa";

/* === THEME (aligned with Analytics/Calendar) === */
const BG = "#181a1b";
const CARD = "#232323";
const BORDER = "#2a3942";
const TEXT = "#e9edef";
const SUBTEXT = "#9fb0bb";

const GOLD = "#ffd966";
const GREEN = "#30b46c";
const RED = "#e66565";

/* ===== Helpers ===== */
const pad2 = (n) => String(n).padStart(2, "0");
const keyFor = (a) =>
  `${a._rid ?? a.lead?.id ?? "x"}|${a.title}|${a.date}|${a.time || ""}`;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** server-provided id field (if any) */
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

/** do we have a real backend id? */
const hasRealId = (r) => Boolean(getRealIdField(r));

/** read-only rid (prefers previously set _rid/_client_uid, else server id) */
const getRID = (r) =>
  String(r?._rid ?? r?._client_uid ?? getRealIdField(r) ?? "");

/* === Local-storage persistence (per-user) === */
const LS_KEYS = (email) => ({
  hidden: `appt_hidden_${email || "anon"}`, // {rid or sid: true}
  done: `appt_done_${email || "anon"}`, // {rid or sid: boolean}
  time: `appt_time_${email || "anon"}`, // {rid or sid: "YYYY-MM-DDTHH:mm:ss"}
  slots: `appt_slots_${email || "anon"}` // {"signature":[rid1,rid2,...]}
});
const loadJSON = (k, fallback) => {
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

/** very small uuid (enough for client-only IDs) */
const uuid = () =>
  "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    // eslint-disable-next-line no-mixed-operators
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const ping = (name) => window.dispatchEvent(new Event(name));

/* ======= Fingerprints for “no-id” rows ======= */
const safe = (v) => (v == null ? "" : String(v));
const sigOf = (r) =>
  [
    safe(r.lead_id ?? r.lead_email ?? r.lead_first_name ?? ""),
    safe(r.appointment_time ?? ""),
    safe(r.title ?? ""),
    safe(r.notes ?? "")
  ].join("|");

/** stable sort key so order doesn't flicker by server order */
const stableKey = (r) =>
  [
    sigOf(r),
    safe(r.created_at || r.updated_at || r.appointment_time || ""),
    safe(r.title || "")
  ].join("~");

/** Assign stable client RIDs using a persisted “slot map” so duplicates don't shift. */
function assignStableRIDs(rows, slotMap) {
  // 1) deterministic global order
  const copy = rows.map((r) => ({ ...r }));
  copy.sort((a, b) => {
    const ka = stableKey(a);
    const kb = stableKey(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  });

  // 2) group by signature
  const bySig = new Map();
  copy.forEach((r) => {
    const sig = hasRealId(r) ? `REAL:${getRealIdField(r)}` : `SIG:${sigOf(r)}`;
    if (!bySig.has(sig)) bySig.set(sig, []);
    bySig.get(sig).push(r);
  });

  // 3) assign rid per group from slotMap, extending when needed
  bySig.forEach((groupRows, sig) => {
    // real-id rows: use their real id as rid, no slots needed
    if (sig.startsWith("REAL:")) {
      groupRows.forEach((r) => {
        r._rid = String(getRealIdField(r));
      });
      return;
    }

    const key = sig.slice(4); // remove "SIG:"
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

/** Normalize backend appointment -> local shape {title,date,time,done,lead,...} */
function normalizeBackend(raw) {
  if (!raw?.appointment_time) return null;
  const dt = new Date(raw.appointment_time);
  if (isNaN(dt)) return null;

  const y = dt.getFullYear();
  const m = pad2(dt.getMonth() + 1);
  const d = pad2(dt.getDate());
  const hh = pad2(dt.getHours());
  const mm = pad2(dt.getMinutes());

  return {
    _backend: raw, // original row for mutations
    _rid: getRID(raw), // already assigned by assignStableRIDs
    title:
      raw.title ||
      raw.lead_first_name ||
      raw.business_name ||
      "Appointment",
    date: `${y}-${m}-${d}`,
    time: `${hh}:${mm}`,
    done: !!(raw.done ?? raw.completed ?? raw.is_done),
    notes: raw.notes || "",
    lead: {
      id: raw.lead_id || `backend-${getRID(raw)}`,
      name: raw.lead_first_name || raw.lead_email || "Client",
      tags: []
    }
  };
}

/** Merge local lead appointments + backend (with overrides already applied) */
function getAppointments(leads = [], backendRows = []) {
  const list = [];
  const now = new Date();

  // local (from leads)
  (leads || []).forEach((lead) =>
    (lead.appointments || []).forEach((app) => {
      const dt = new Date(`${app.date}T${app.time || "00:00"}`);
      list.push({
        ...app,
        lead,
        sortKey: dt.getTime(),
        isOverdue: !app.done && dt < now
      });
    })
  );

  // backend (normalized before this function)
  (backendRows || []).forEach((a) => {
    const dt = new Date(`${a.date}T${a.time || "00:00"}`);
    list.push({
      ...a,
      sortKey: dt.getTime(),
      isOverdue: !a.done && dt < now
    });
  });

  list.sort((a, b) => a.sortKey - b.sortKey);
  return list;
}

function categorize(appointments) {
  const buckets = { overdue: [], today: [], next7: [], later: [], done: [] };
  const now = new Date();

  appointments.forEach((a) => {
    const when = new Date(`${a.date}T${a.time || "00:00"}`);
    if (a.done) return void buckets.done.push(a);
    if (when < now) return void buckets.overdue.push(a);
    if (isSameDay(when, now)) return void buckets.today.push(a);
    const diff = Math.ceil((startOfDay(when) - startOfDay(now)) / 86400000);
    if (diff <= 7) buckets.next7.push(a);
    else buckets.later.push(a);
  });

  return buckets;
}

export default function Appointments({ user, leads = [], setLeads }) {
  const API = process.env.REACT_APP_API_URL;

  /** Backend list straight from server */
  const [backendAppointments, setBackendAppointments] = useState([]);

  /** Frontend overrides persisted across tab switches (per client RID and server ID) */
  const [hiddenIds, setHiddenIds] = useState({});
  const [doneOverride, setDoneOverride] = useState({});
  const [timeOverride, setTimeOverride] = useState({});
  const [slotMap, setSlotMap] = useState({}); // signature -> [rid,rid,...]

  /* hydrate per-user state on mount / user change */
  useEffect(() => {
    const K = LS_KEYS(user?.email);
    setHiddenIds(loadJSON(K.hidden, {}));
    setDoneOverride(loadJSON(K.done, {}));
    setTimeOverride(loadJSON(K.time, {}));
    setSlotMap(loadJSON(K.slots, {}));
  }, [user?.email]);

  /* persist whenever they change */
  useEffect(() => {
    saveJSON(LS_KEYS(user?.email).hidden, hiddenIds);
  }, [hiddenIds, user?.email]);
  useEffect(() => {
    saveJSON(LS_KEYS(user?.email).done, doneOverride);
  }, [doneOverride, user?.email]);
  useEffect(() => {
    saveJSON(LS_KEYS(user?.email).time, timeOverride);
  }, [timeOverride, user?.email]);
  useEffect(() => {
    saveJSON(LS_KEYS(user?.email).slots, slotMap);
  }, [slotMap, user?.email]);

  /* fetch backend rows */
  const fetchBackend = async () => {
    if (!API || !user?.email) return;
    try {
      const r = await fetch(
        `${API}/api/appointments/${encodeURIComponent(user.email)}`
      );
      const j = await r.json().catch(() => ({}));
      setBackendAppointments(
        Array.isArray(j?.appointments) ? j.appointments : []
      );
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchBackend();

    const onChanged = () => fetchBackend(); // other tabs/views may change
    window.addEventListener("appointments:changed", onChanged);

    // also refresh when tab regains focus
    const onVis = () => {
      if (document.visibilityState === "visible") fetchBackend();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("appointments:changed", onChanged);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API, user?.email]);

  /**
   * STEP 1 — Build stable client RIDs (slot map).
   */
  const withStableRIDs = useMemo(() => {
    const nextSlots = { ...slotMap };
    const rowsWithRIDs = assignStableRIDs(backendAppointments || [], nextSlots);
    if (JSON.stringify(nextSlots) !== JSON.stringify(slotMap)) {
      setSlotMap(nextSlots);
    }
    return rowsWithRIDs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendAppointments]);

  /**
   * STEP 2 — Apply local overrides by rid (time/done) and filter hidden by rid.
   */
  const effectiveBackend = useMemo(() => {
    return (withStableRIDs || [])
      .map((r) => {
        const id = r._rid;
        const clone = { ...r };
        if (timeOverride[id]) clone.appointment_time = timeOverride[id];
        if (typeof doneOverride[id] === "boolean") clone.done = doneOverride[id];
        return clone;
      })
      .filter((r) => !hiddenIds[r._rid]);
  }, [withStableRIDs, hiddenIds, doneOverride, timeOverride]);

  /** STEP 3 — Normalize AFTER overrides */
  const normalizedBackend = useMemo(
    () => effectiveBackend.map((r) => normalizeBackend(r)).filter(Boolean),
    [effectiveBackend]
  );

  const allAppointments = useMemo(
    () => getAppointments(leads, normalizedBackend),
    [leads, normalizedBackend]
  );

  const [search, setSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return allAppointments;
    const q = search.toLowerCase();
    return allAppointments.filter((a) =>
      `${a.title} ${a.lead?.name || ""}`.toLowerCase().includes(q)
    );
  }, [allAppointments, search]);

  const buckets = useMemo(() => categorize(filtered), [filtered]);

  /* ===== API helpers ===== */
  const withSeconds = (date, time) => `${date}T${(time || "00:00")}:00`;

  // real backend id to talk to the API, else null
  const serverIdOf = (appt) => getRealIdField(appt?._backend) ?? null;

  // convenience: update override maps under both RID and ServerID (so Calendar can apply immediately)
  const updateDoneOverrides = (appt, val) => {
    const rid = appt._rid;
    const sid = serverIdOf(appt);
    setDoneOverride((m) => ({ ...m, [rid]: val, ...(sid ? { [sid]: val } : {}) }));
    ping("appointments:overrides-updated");
  };
  const rollbackDoneOverrides = (appt, prevVal) => {
    const rid = appt._rid;
    const sid = serverIdOf(appt);
    setDoneOverride((m) => ({ ...m, [rid]: prevVal, ...(sid ? { [sid]: prevVal } : {}) }));
    ping("appointments:overrides-updated");
  };
  const updateTimeOverrides = (appt, iso) => {
    const rid = appt._rid;
    const sid = serverIdOf(appt);
    setTimeOverride((m) => ({ ...m, [rid]: iso, ...(sid ? { [sid]: iso } : {}) }));
    ping("appointments:overrides-updated");
  };
  const removeTimeOverrides = (appt) => {
    const rid = appt._rid;
    const sid = serverIdOf(appt);
    setTimeOverride((m) => {
      const c = { ...m };
      delete c[rid];
      if (sid) delete c[sid];
      return c;
    });
    ping("appointments:overrides-updated");
  };
  const hideOverrides = (appt) => {
    const rid = appt._rid;
    const sid = serverIdOf(appt);
    setHiddenIds((m) => ({ ...m, [rid]: true, ...(sid ? { [sid]: true } : {}) }));
    ping("appointments:overrides-updated");
  };
  const unhideOverrides = (appt) => {
    const rid = appt._rid;
    const sid = serverIdOf(appt);
    setHiddenIds((m) => {
      const c = { ...m };
      delete c[rid];
      if (sid) delete c[sid];
      return c;
    });
    ping("appointments:overrides-updated");
  };

  async function apiUpdateBackend(appt, updates) {
    const sid = serverIdOf(appt);
    if (!API || !user?.email || !sid) return false; // cannot update without real id
    try {
      const body = {
        ...updates,
        // common aliases
        done: updates.done,
        is_done: updates.done,
        completed: updates.done,
        status:
          updates.done === true
            ? "completed"
            : updates.done === false
            ? "scheduled"
            : undefined,
        appointment_time: updates.appointment_time,
        date: updates.appointment_time
          ? updates.appointment_time.slice(0, 10)
          : undefined,
        time: updates.appointment_time
          ? updates.appointment_time.slice(11, 16)
          : undefined
      };
      const res = await fetch(
        `${API}/api/appointments/${encodeURIComponent(
          user.email
        )}/${encodeURIComponent(String(sid))}`,
        {
          method: "PUT", // change to "PATCH" if your Flask route expects PATCH
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  async function apiDeleteBackend(appt) {
    const sid = serverIdOf(appt);
    if (!API || !user?.email || !sid) return false; // cannot DELETE without real id
    try {
      const res = await fetch(
        `${API}/api/appointments/${encodeURIComponent(
          user.email
        )}/${encodeURIComponent(String(sid))}`,
        { method: "DELETE" }
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  /* ===== Mutations (backend + local with persistence) ===== */
  const isBackend = (appt) => Boolean(appt._backend);

  async function toggleDone(appt) {
    if (isBackend(appt)) {
      const newDone = !appt.done;

      // optimistic local override under both keys
      updateDoneOverrides(appt, newDone);

      // try to update server; rollback if real id and fail
      const ok = await apiUpdateBackend(appt, { done: newDone });
      if (serverIdOf(appt) && !ok) {
        rollbackDoneOverrides(appt, !newDone);
      }

      // notify other views
      ping("appointments:changed");
      return;
    }
    // LOCAL lead appointment
    const { lead, date, title, time } = appt;
    setLeads((prev) =>
      (prev || []).map((l) => {
        if (l.id !== lead.id) return l;
        return {
          ...l,
          appointments: (l.appointments || []).map((x) =>
            x.date === date &&
            x.title === title &&
            (x.time || "") === (time || "")
              ? { ...x, done: !x.done }
              : x
          )
        };
      })
    );
    ping("appointments:changed");
  }

  async function reschedule(appt, days) {
    if (isBackend(appt)) {
      const base = new Date(`${appt.date}T${appt.time || "00:00"}`);
      base.setDate(base.getDate() + days);
      const newDate = `${base.getFullYear()}-${pad2(
        base.getMonth() + 1
      )}-${pad2(base.getDate())}`;
      const newTime = `${pad2(base.getHours())}:${pad2(base.getMinutes())}`;
      const iso = withSeconds(newDate, newTime);

      updateTimeOverrides(appt, iso);

      const ok = await apiUpdateBackend(appt, { appointment_time: iso });
      if (serverIdOf(appt) && !ok) {
        removeTimeOverrides(appt);
      }
      ping("appointments:changed");
      return;
    }
    // LOCAL lead appointment
    const { lead, date, title, time } = appt;
    const base = new Date(`${date}T${time || "00:00"}`);
    base.setDate(base.getDate() + days);
    const newDate = `${base.getFullYear()}-${pad2(
      base.getMonth() + 1
    )}-${pad2(base.getDate())}`;
    setLeads((prev) =>
      (prev || []).map((l) => {
        if (l.id !== lead.id) return l;
        return {
          ...l,
          appointments: (l.appointments || []).map((x) =>
            x.date === date &&
            x.title === title &&
            (x.time || "") === (time || "")
              ? { ...x, date: newDate }
              : x
          )
        };
      })
    );
    ping("appointments:changed");
  }

  async function remove(appt) {
    if (isBackend(appt)) {
      // optimistic tombstone for THIS exact rid and server id
      hideOverrides(appt);

      const ok = await apiDeleteBackend(appt);
      if (serverIdOf(appt) && !ok) {
        unhideOverrides(appt);
      }
      ping("appointments:changed");
      return;
    }
    // LOCAL lead appointment
    const { lead, date, title, time } = appt;
    setLeads((prev) =>
      (prev || []).map((l) =>
        l.id === lead.id
          ? {
              ...l,
              appointments: (l.appointments || []).filter(
                (x) =>
                  !(
                    x.date === date &&
                    x.title === title &&
                    (x.time || "") === (time || "")
                  )
              )
            }
          : l
      )
    );
    ping("appointments:changed");
  }

  function beginEdit(appt) {
    setForm({
      leadId: String(appt.lead.id),
      title: appt.title,
      date: appt.date,
      time: appt.time || ""
    });
    setEditing(appt);
    setShowModal(true);
  }

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    leadId: "",
    title: "",
    date: "",
    time: ""
  });
  const [editing, setEditing] = useState(null);

  async function handleSave() {
    const { leadId, title, date, time } = form;
    if (!leadId || !title || !date) return;

    if (editing && editing._backend) {
      const iso = `${date}T${(time || "00:00")}:00`;

      updateTimeOverrides(editing, iso);

      const ok = await apiUpdateBackend(editing, {
        appointment_time: iso,
        title,
        notes: editing.notes || ""
      });
      if (serverIdOf(editing) && !ok) {
        removeTimeOverrides(editing);
      }
      setShowModal(false);
      setEditing(null);
      setForm({ leadId: "", title: "", date: "", time: "" });
      ping("appointments:changed");
      return;
    }

    // LOCAL lead appointment
    setLeads((prev) =>
      (prev || []).map((l) =>
        String(l.id) === String(leadId)
          ? {
              ...l,
              appointments: [
                ...(l.appointments || []).filter(
                  (x) =>
                    !editing ||
                    !(
                      x.date === editing?.date &&
                      x.title === editing?.title &&
                      (x.time || "") === (editing?.time || "")
                    )
                ),
                { title, date, time, done: false }
              ]
            }
          : l
      )
    );
    setShowModal(false);
    setEditing(null);
    setForm({ leadId: "", title: "", date: "", time: "" });
    ping("appointments:changed");
  }

  /* ===== UI ===== */
  const stat = {
    overdue: buckets.overdue.length,
    today: buckets.today.length,
    week: buckets.next7.length,
    upcoming:
      buckets.overdue.length +
      buckets.today.length +
      buckets.next7.length +
      buckets.later.length,
    done: buckets.done.length
  };

  return (
    <div
      style={{
        padding: "28px",
        background: BG,
        minHeight: "100vh",
        boxSizing: "border-box"
      }}
    >
      {/* Header + Add */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16
        }}
      >
        <div
          style={{
            color: TEXT,
            fontWeight: 900,
            fontSize: "2.05em",
            letterSpacing: "-0.5px"
          }}
        >
          Appointments
        </div>
        <button
          onClick={() => {
            setShowModal(true);
            setEditing(null);
            setForm({ leadId: "", title: "", date: "", time: "" });
          }}
          style={{
            background: GOLD,
            color: "#191919",
            border: "none",
            borderRadius: 10,
            fontWeight: 800,
            padding: "10px 16px",
            fontSize: "1.02em",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            gap: 10
          }}
        >
          <FaPlus /> Add Appointment
        </button>
      </div>

      {/* Top controls */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 18,
          alignItems: "center"
        }}
      >
        {/* search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: CARD,
            borderRadius: 10,
            padding: "0 12px",
            border: `1px solid ${BORDER}`
          }}
        >
          <FaSearch color={GOLD} style={{ marginRight: 8 }} />
          <input
            placeholder="Search by title or lead…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: TEXT,
              fontSize: "1.02em",
              padding: "10px 0",
              width: 260
            }}
          />
        </div>

        {/* view toggle */}
        <div
          style={{
            display: "inline-flex",
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            overflow: "hidden"
          }}
        >
          <button
            onClick={() => setShowCompleted(false)}
            style={{
              background: !showCompleted ? GOLD : "transparent",
              color: !showCompleted ? "#191919" : TEXT,
              padding: "8px 14px",
              fontWeight: 900,
              border: "none",
              cursor: "pointer"
            }}
          >
            Active
          </button>
          <button
            onClick={() => setShowCompleted(true)}
            style={{
              background: showCompleted ? GOLD : "transparent",
              color: showCompleted ? "#191919" : TEXT,
              padding: "8px 14px",
              fontWeight: 900,
              border: "none",
              cursor: "pointer"
            }}
          >
            Completed
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 18
        }}
      >
        <StatCard
          icon={<FaExclamationTriangle />}
          label="Overdue"
          value={stat.overdue}
          color={RED}
        />
        <StatCard icon={<FaSun />} label="Today" value={stat.today} color={GOLD} />
        <StatCard
          icon={<FaCalendarWeek />}
          label="Next 7 days"
          value={stat.week}
          color={GREEN}
        />
        <StatCard
          icon={<FaForward />}
          label="All upcoming"
          value={stat.upcoming}
          color={TEXT}
        />
      </div>

      {/* Sections */}
      {!showCompleted ? (
        <>
          <Section
            title="Overdue"
            color={RED}
            items={buckets.overdue}
            renderItem={(a) => (
              <AppointmentCard
                appt={a}
                onDone={() => toggleDone(a)}
                onEdit={() => beginEdit(a)}
                onDelete={() => remove(a)}
                onResched={(d) => reschedule(a, d)}
              />
            )}
          />

          <Section
            title="Today"
            color={GOLD}
            items={buckets.today}
            renderItem={(a) => (
              <AppointmentCard
                appt={a}
                onDone={() => toggleDone(a)}
                onEdit={() => beginEdit(a)}
                onDelete={() => remove(a)}
                onResched={(d) => reschedule(a, d)}
              />
            )}
          />

          <Section
            title="Next 7 Days"
            color={GREEN}
            items={buckets.next7}
            renderItem={(a) => (
              <AppointmentCard
                appt={a}
                onDone={() => toggleDone(a)}
                onEdit={() => beginEdit(a)}
                onDelete={() => remove(a)}
                onResched={(d) => reschedule(a, d)}
              />
            )}
          />

          <Section
            title="Later"
            color={SUBTEXT}
            items={buckets.later}
            renderItem={(a) => (
              <AppointmentCard
                appt={a}
                onDone={() => toggleDone(a)}
                onEdit={() => beginEdit(a)}
                onDelete={() => remove(a)}
                onResched={(d) => reschedule(a, d)}
              />
            )}
          />
        </>
      ) : (
        <Section
          title="Completed"
          color={GREEN}
          items={[...buckets.done].sort((a, b) => b.sortKey - a.sortKey)}
          renderItem={(a) => (
            <AppointmentCard
              appt={a}
              onDone={() => toggleDone(a)}
              onEdit={() => beginEdit(a)}
              onDelete={() => remove(a)}
              onResched={(d) => reschedule(a, d)}
            />
          )}
        />
      )}

      {/* Modal */}
      {showModal && (
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
              padding: "28px 30px",
              minWidth: 420,
              maxWidth: 520,
              width: "92%",
              boxShadow: "0 2px 22px rgba(0,0,0,0.5)",
              border: `2px solid ${GOLD}`
            }}
          >
            <h3 style={{ color: GOLD, fontWeight: 900, marginBottom: 16 }}>
              {editing ? "Edit Appointment" : "Add Appointment"}
            </h3>

            <div style={{ marginBottom: 14 }}>
              <label style={{ color: TEXT, marginRight: 8, fontWeight: 900 }}>
                Lead:
              </label>
              <LiveLeadSearch
                leads={leads}
                value={form.leadId}
                onChange={(id) => setForm((f) => ({ ...f, leadId: id }))}
              />
            </div>

            <Field label="Title">
              <input
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                style={inputStyle}
                placeholder="Appointment Title"
              />
            </Field>

            <Field label="Date">
              <input
                type="date"
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
                style={inputStyle}
              />
            </Field>

            <Field label="Time">
              <input
                type="time"
                value={form.time}
                onChange={(e) =>
                  setForm((f) => ({ ...f, time: e.target.value }))
                }
                style={inputStyle}
              />
            </Field>

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                onClick={handleSave}
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
                {editing ? "Save" : "Add"}
              </button>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditing(null);
                }}
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
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== UI Bits ===== */
function StatCard({ icon, label, value, color }) {
  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12
      }}
    >
      <div style={{ fontSize: 18, color }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ color: SUBTEXT, fontWeight: 800, fontSize: 12 }}>
          {label}
        </div>
        <div style={{ color: TEXT, fontWeight: 900, fontSize: 20 }}>{value}</div>
      </div>
    </div>
  );
}

function Section({ title, color, items, renderItem }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
          paddingLeft: 2
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: color,
            display: "inline-block"
          }}
        />
        <div style={{ color: TEXT, fontWeight: 900 }}>{title}</div>
        <div style={{ color: SUBTEXT, fontWeight: 800, fontSize: 12 }}>
          ({items.length})
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
          gap: 14
        }}
      >
        {items.map((a) => (
          <div key={keyFor(a)}>{renderItem(a)}</div>
        ))}
      </div>
    </div>
  );
}

function AppointmentCard({ appt, onDone, onEdit, onDelete, onResched }) {
  const isOverdue = appt.isOverdue && !appt.done;
  const statusColor = isOverdue ? RED : appt.done ? GREEN : GOLD;

  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderLeft: `6px solid ${statusColor}`,
        borderRadius: 12,
        padding: "14px 16px",
        minHeight: 90,
        display: "flex",
        gap: 14,
        alignItems: "center",
        boxShadow: "0 2px 18px rgba(0,0,0,0.25)",
        opacity: appt.done ? 0.65 : 1
      }}
    >
      <div style={{ fontSize: 24 }}>
        <FaCalendarAlt color={GOLD} />
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ color: TEXT, fontWeight: 900, lineHeight: 1.15 }}>
          {appt.title}
          <span style={{ color: SUBTEXT, marginLeft: 8, fontWeight: 800 }}>
            {appt.lead?.name ? `(${appt.lead.name})` : ""}
          </span>
        </div>
        <div style={{ color: statusColor, fontWeight: 800, marginTop: 6 }}>
          {appt.time ? `${appt.date} ${appt.time}` : appt.date}
          {isOverdue && <span style={{ color: RED, marginLeft: 10 }}>(Overdue)</span>}
          {appt.done && <span style={{ color: GREEN, marginLeft: 10 }}>(Done)</span>}
        </div>

        {!appt.done && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Chip onClick={() => onResched(1)}>+1d</Chip>
            <Chip onClick={() => onResched(3)}>+3d</Chip>
            <Chip onClick={() => onResched(7)}>+1w</Chip>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onDone}
          style={{
            background: appt.done ? GREEN : "transparent",
            color: appt.done ? "#232323" : GOLD,
            border: `2px solid ${GOLD}`,
            borderRadius: 8,
            padding: "7px 12px",
            fontWeight: 900,
            cursor: "pointer"
          }}
        >
          {appt.done ? "Undo" : "Done"}
        </button>
        <button
          onClick={onEdit}
          style={{
            background: "transparent",
            color: GOLD,
            border: `1.5px solid ${GOLD}`,
            borderRadius: 7,
            padding: "6px 10px",
            fontWeight: 800,
            cursor: "pointer"
          }}
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          style={{
            background: "transparent",
            color: RED,
            border: `1.5px solid ${RED}`,
            borderRadius: 7,
            padding: "6px 10px",
            fontWeight: 800,
            cursor: "pointer"
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function Chip({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "#1e2326",
        color: TEXT,
        border: `1px solid ${BORDER}`,
        borderRadius: 999,
        padding: "4px 10px",
        fontWeight: 800,
        fontSize: 12,
        cursor: "pointer"
      }}
    >
      {children}
    </button>
  );
}

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

function LiveLeadSearch({ leads, value, onChange }) {
  const [search, setSearch] = useState("");
  const filtered = !search
    ? leads
    : leads.filter(
        (l) =>
          (l.name || "").toLowerCase().includes(search.toLowerCase()) ||
          (l.email || "").toLowerCase().includes(search.toLowerCase())
      );
  const selected = leads.find((l) => String(l.id) === String(value));
  return (
    <>
      <input
        type="text"
        placeholder="Search lead name or email..."
        value={selected ? selected.name : search}
        onChange={(e) => {
          setSearch(e.target.value);
          onChange("");
        }}
        style={inputStyle}
      />
      <div
        style={{
          maxHeight: 140,
          overflowY: "auto",
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          background: BG,
          marginTop: 6
        }}
      >
        {filtered.length === 0 && (
          <div style={{ color: GOLD, padding: 10, fontWeight: 700 }}>No leads found.</div>
        )}
        {filtered.map((l) => (
          <div
            key={l.id}
            style={{
              padding: "9px 12px",
              color: value === String(l.id) ? "#232323" : TEXT,
              background: value === String(l.id) ? GOLD : "transparent",
              cursor: "pointer",
              fontWeight: 900
            }}
            onClick={() => {
              onChange(String(l.id));
              setSearch(l.name);
            }}
          >
            {l.name}{" "}
            <span style={{ color: GOLD, marginLeft: 7, fontWeight: 700, fontSize: 12 }}>
              {l.email}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
