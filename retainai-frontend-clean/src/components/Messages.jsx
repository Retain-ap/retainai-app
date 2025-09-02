// src/components/Messages.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { SiWhatsapp } from "react-icons/si";

/** ===== THEME ===== */
const C = {
  bg: "#181a1b",
  panel: "#232323",
  header: "#1d1f20",
  border: "#2b2f33",
  text: "#f3f4f5",
  sub: "#9aa3ab",
  accent: "#f7cb53",
  wa: "#25D366",
  in: "#202c33",
  out: "#005c4b",
};
const PANEL_H = "72vh";

/** ===== HELPERS ===== */
// Strip AI/system headers, template echo, and any "it's/it’s/this is <name> from|at <biz> —|–|-|:" intro anywhere
function cleanAIText(t) {
  let s = String(t || "");

  // 1) remove common headers + our template echo
  s = s
    .replace(/^(Subject|Lead Name|Recipient):.*(\n|$)/gi, "")
    .replace(/^\s*[\w ]+:\s*$/gim, "")
    .replace(/^\s*\n+/g, "")
    .replace(/^\s*\[template:[^\]]+\]\s*/i, "");

  // 2) remove intro anywhere (iteratively); keep the leading delimiter if present
  const introAnywhere = new RegExp(
    String.raw`(^|[\s]*[,;:\-\u2013\u2014]\s*)` +        // optional delimiter we keep
    String.raw`(?:it'?s|it\u2019s|this\s+is)\s+` +       // it's / it’s / this is
    String.raw`[^,\n\r;:\-\u2013\u2014]{1,60}\s+` +      // name part
    String.raw`(?:from|at)\s+` +                         // from/at
    String.raw`[^,\n\r;:\-\u2013\u2014]{1,120}\s*` +     // business
    String.raw`[\-\u2013\u2014:]\s*`,                    // end punct
    "gi"
  );
  let prev = null;
  while (prev !== s) {
    prev = s;
    s = s.replace(introAnywhere, (_m, keep) => (keep || ""));
  }

  // 3) tidy
  s = s.replace(/[ \t]{2,}/g, " ");
  return s.trim();
}

// minimal HTML → text
const htmlToText = (s) => {
  if (!s) return "";
  let t = String(s);
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/p>\s*<p>/gi, "\n\n");
  t = t.replace(/<\/?[^>]+>/g, "");
  return t.trim();
};

const initials = (name, email) =>
  !name && !email
    ? "?"
    : (name ? name.split(" ").map((p) => p[0]).join("") : (email || "?")[0])
        .toUpperCase()
        .slice(0, 2);

const digits = (s = "") => (s || "").replace(/\D/g, "");
const fmtNA = (num) => {
  const n = digits(num);
  return n.length === 11 && n.startsWith("1")
    ? `(${n.slice(1, 4)}) ${n.slice(4, 7)}-${n.slice(7)}`
    : num || "";
};

// lang helpers
const toApiLang = (ui) => String(ui || "").replace("-", "_");
const normApi = (code) => {
  if (!code) return "en";
  const c = String(code).replace("-", "_").trim();
  const p = c.split("_");
  return p.length === 2 ? `${p[0].toLowerCase()}_${p[1].toUpperCase()}` : p[0].toLowerCase();
};
const toUiLang = (api) => {
  const a = String(api || "").toLowerCase();
  if (!a) return "en";
  return a.startsWith("en") ? "en" : api;
};

/* simple cross-tab ping */
const ping = (name) => window.dispatchEvent(new Event(name));

/** ===== light NLP for appointment text ===== */
function pad2(n) { return String(n).padStart(2, "0"); }
function nextDow(from, targetDow, allowToday = false) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const curr = d.getDay();
  let delta = (targetDow - curr + 7) % 7;
  if (delta === 0 && !allowToday) delta = 7;
  d.setDate(d.getDate() + delta);
  return d;
}
function thisOrNextDow(from, targetDow) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const curr = d.getDay();
  let delta = targetDow - curr;
  if (delta < 0) delta += 7;
  if (delta === 0) return d;
  d.setDate(d.getDate() + delta);
  return d;
}
function toISODate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseApptFromText(text) {
  if (!text) return null;
  const t = text.toLowerCase();

  const ampm = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  const hhmm = !ampm && t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);

  let hours = null;
  let minutes = 0;

  if (ampm) {
    const h = parseInt(ampm[1], 10);
    const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
    const isPM = /p/i.test(ampm[3]);
    hours = (h % 12) + (isPM ? 12 : 0);
    minutes = m;
  } else if (hhmm) {
    hours = parseInt(hhmm[1], 10);
    minutes = parseInt(hhmm[2], 10);
  } else {
    const bareHour = t.match(/\bat\s*(\d{1,2})\b/);
    if (bareHour) {
      const h = parseInt(bareHour[1], 10);
      if (h >= 1 && h <= 12) {
        hours = h <= 7 ? h + 12 : h;
      }
    }
  }

  const dows = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  let targetDate = null;
  const now = new Date();

  if (/\btoday\b/.test(t)) {
    targetDate = new Date(now);
  } else if (/\btomorrow\b/.test(t)) {
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + 1);
  } else {
    const dowMatch = t.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (dowMatch) {
      const dow = dows[dowMatch[1].toLowerCase()];
      if (/\bthis\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(t)) {
        const d = thisOrNextDow(now, dow);
        targetDate = d < now ? nextDow(now, dow) : d;
      } else if (/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(t)) {
        targetDate = nextDow(now, dow, false);
      } else {
        const allowToday =
          hours != null ? hours > now.getHours() || (hours === now.getHours() && minutes > now.getMinutes()) : false;
        targetDate = nextDow(now, dow, allowToday);
      }
    }
  }

  if (!targetDate) return null;
  if (hours == null) return null;
  const dateISO = toISODate(targetDate);
  const timeStr = `${pad2(hours)}:${pad2(minutes)}`;
  return { date: dateISO, time: timeStr };
}

/** ===== Suggestion persistence ===== */
const SUG_KEYS = (email) => ({
  consumed: `msg_suggestions_consumed_${email || "anon"}`,
});
const loadJSON = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const saveJSON = (k, obj) => { try { localStorage.setItem(k, JSON.stringify(obj || {})); } catch {} };
const sigForSuggestion = (leadId, sug) => `${String(leadId || "lead")}|${sug?.date || ""}|${sug?.time || ""}`;

/** ===== Automation log persistence ===== */
const AUTO_LOG_KEY = (userEmail, leadId) =>
  `auto_log_${(userEmail || "anon").toLowerCase()}_${String(leadId || "lead")}`;

/** ===== Param inference for ANY template ===== */
const FIRSTNAME = (s = "") => String(s).trim().split(/\s+/)[0] || "";
const LOWER = (s = "") => String(s).toLowerCase();
const between = (txt, startIdx, endIdx, span = 32) => {
  const left = Math.max(0, startIdx - span);
  const right = Math.min(txt.length, endIdx + span);
  return {
    left: LOWER(txt.slice(left, startIdx)),
    right: LOWER(txt.slice(endIdx, right)),
  };
};

// Guess a semantic "kind" for {{n}} using text around it
function inferParamKindsFromBody(bodyText, count) {
  const kinds = Array.from({ length: count }, () => null);
  if (!bodyText || !count) return kinds;

  for (let i = 1; i <= count; i++) {
    const re = new RegExp(`\\{\\{\\s*${i}\\s*\\}\\}`, "g");
    const m = re.exec(bodyText);
    if (!m) continue;
    const { index } = m;
    const ctx = between(bodyText, index, index + m[0].length, 36);
    const L = ctx.left;
    const R = ctx.right;

    // Heuristics
    if (/(^|\s)(hi|hello|hey|dear)\s*$/.test(L) || /(client|customer|name)\s*$/.test(L)) {
      kinds[i - 1] = "lead_name"; continue;
    }
    if (/(i'?m|i am|this is)\s*$/.test(L)) {
      kinds[i - 1] = "user_name"; continue;
    }
    if (/(from|at)\s*$/.test(L) || /^(\s*(from|at)\b)/.test(R)) {
      kinds[i - 1] = "business"; continue;
    }
    if (/\b(date|day)\b/.test(L + " " + R)) {
      kinds[i - 1] = "date"; continue;
    }
    if (/\b(time|slot)\b/.test(L + " " + R)) {
      kinds[i - 1] = "time"; continue;
    }
    if (/\b(location|address|studio|office)\b/.test(L + " " + R)) {
      kinds[i - 1] = "location"; continue;
    }
    if (/\b(service|treatment|package)\b/.test(L + " " + R)) {
      kinds[i - 1] = "service"; continue;
    }
    if (/\b(price|quote|budget)\b/.test(L + " " + R)) {
      kinds[i - 1] = "price"; continue;
    }
    if (/\bemail\b/.test(L + " " + R)) {
      kinds[i - 1] = "email"; continue;
    }
    if (/\bphone|number\b/.test(L + " " + R)) {
      kinds[i - 1] = "phone"; continue;
    }

    // Unknown — leave null and we’ll apply index-based defaults
  }

  // Fill remaining nulls by index-based sane defaults
  for (let i = 0; i < kinds.length; i++) {
    if (!kinds[i]) {
      kinds[i] =
        i === 0 ? "lead_name" :
        i === 1 ? "user_name" :
        i === 2 ? "business" :
        i === 3 ? "details" :
        i === 4 ? "location" :
        i === 5 ? "email" : "details";
    }
  }
  return kinds;
}

function valueForKind(kind, { user, lead, input, suggestion }) {
  switch (kind) {
    case "lead_name":
      return FIRSTNAME(lead?.name) || lead?.name || (lead?.email ? lead.email.split("@")[0] : "") || "there";
    case "user_name":
      return user?.name || "";
    case "business":
      return user?.business || user?.businessType || "";
    case "details":
      return (input || "").trim();
    case "date":
      return suggestion?.date || "";
    case "time":
      return suggestion?.time || "";
    case "location":
      return lead?.location || user?.location || "";
    case "service":
      return Array.isArray(lead?.tags) && lead.tags.length ? lead.tags[0] : "";
    case "price":
      return "";
    case "email":
      return lead?.email || user?.email || "";
    case "phone":
      return lead?.whatsapp || lead?.phone || "";
    default:
      return "";
  }
}

function labelForKind(kind, i) {
  const base = `Parameter ${i + 1}`;
  switch (kind) {
    case "lead_name": return `Lead name ({{${i + 1}}})`;
    case "user_name": return `Your name ({{${i + 1}}})`;
    case "business": return `Business ({{${i + 1}}})`;
    case "details": return `Details / message ({{${i + 1}}})`;
    case "date": return `Date ({{${i + 1}}})`;
    case "time": return `Time ({{${i + 1}}})`;
    case "location": return `Location ({{${i + 1}}})`;
    case "service": return `Service ({{${i + 1}}})`;
    case "price": return `Price ({{${i + 1}}})`;
    case "email": return `Email ({{${i + 1}}})`;
    case "phone": return `Phone ({{${i + 1}}})`;
    default: return `${base} ({{${i + 1}}})`;
  }
}

/** ===== COMPONENT ===== */
export default function Messages({ user, leads = [], defaultTemplate = "", language = "en" }) {
  const API = process.env.REACT_APP_API_URL;

  /** --- selection & list filter --- */
  const [q, setQ] = useState("");
  const filteredLeads = useMemo(() => {
    if (!q.trim()) return leads;
    const s = q.trim().toLowerCase();
    return leads.filter(
      (l) =>
        (l.name || "").toLowerCase().includes(s) ||
        (l.email || "").toLowerCase().includes(s) ||
        (l.phone || "").toLowerCase().includes(s) ||
        (l.whatsapp || "").toLowerCase().includes(s)
    );
  }, [leads, q]);

  const [activeLeadId, setActiveLeadId] = useState(filteredLeads?.[0]?.id ?? null);

  useEffect(() => {
    if (!filteredLeads.length) {
      setActiveLeadId(null);
      return;
    }
    if (!filteredLeads.find((l) => String(l.id) === String(activeLeadId))) {
      setActiveLeadId(filteredLeads[0]?.id ?? null);
    }
  }, [filteredLeads, activeLeadId]);

  const lead = useMemo(
    () => filteredLeads.find((l) => String(l.id) === String(activeLeadId)),
    [filteredLeads, activeLeadId]
  );

  const toE164 = useMemo(() => digits(lead?.whatsapp || lead?.phone), [lead]);

  /** --- thread state --- */
  const [thread, setThread] = useState([]);
  const [loading, setLoading] = useState(false);
  const chatRef = useRef(null);
  const pollTimer = useRef(null);

  // automation log (for current lead)
  const [autoLog, setAutoLog] = useState([]);
  const [showAutoLog, setShowAutoLog] = useState(false);

  // hard reset when switching leads
  useEffect(() => {
    setThread([]);
    setInput("");
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
    setSuggestion(null);

    // load per-lead automation log
    if (user?.email && lead?.id) {
      const key = AUTO_LOG_KEY(user.email, lead.id);
      setAutoLog(loadJSON(key, []));
    } else {
      setAutoLog([]);
    }
    setShowAutoLog(false);
  }, [activeLeadId, user?.email, lead?.id]);

  // poll the server for this lead
  useEffect(() => {
    if (!API || !user?.email || !lead?.id) return;
    let stop = false;

    const tick = async () => {
      try {
        const r = await fetch(
          `${API}/api/whatsapp/messages?user_email=${encodeURIComponent(user.email)}&lead_id=${encodeURIComponent(
            lead.id
          )}`
        );
        const j = await r.json();
        if (!stop) setThread(Array.isArray(j?.messages) ? j.messages : []);
      } catch {}
      if (!stop) pollTimer.current = setTimeout(tick, 6000);
    };

    tick();
    return () => {
      stop = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [API, user?.email, lead?.id]);

  // scroll to bottom on new messages
  useEffect(() => {
    chatRef.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }, [thread.length, activeLeadId]);

  /** --- 24h gate & templates --- */
  const [gate, setGate] = useState({
    inside24h: false,
    canFreeText: false,
    canTemplate: false,
    templateApproved: false,
    templateStatus: "UNKNOWN",
  });

  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState(defaultTemplate);
  const [templateLangUI, setTemplateLangUI] = useState(language);

  const [health, setHealth] = useState(null);
  useEffect(() => {
    if (!API) return;
    (async () => {
      try {
        const r = await fetch(`${API}/api/whatsapp/health`);
        const j = await r.json();
        setHealth(j);
      } catch {}
    })();
  }, [API]);

  // fetch template list
  useEffect(() => {
    if (!API) return;
    (async () => {
      try {
        const r = await fetch(`${API}/api/whatsapp/templates`);
        const j = await r.json();
        const rows = Array.isArray(j?.data?.data) ? j.data.data : [];
        const cleaned = rows.filter((t) => String(t?.name || "").toLowerCase() !== "hello_world");
        setTemplates(
          cleaned.map((t) => ({
            name: t.name,
            languageUI: toUiLang(t.normalized_language || t.language),
            status: String(t.status || "").toUpperCase(),
          }))
        );
      } catch {}
    })();
  }, [API]);

  // choose a default approved template
  useEffect(() => {
    if (!templates.length) return;
    const hasCurrent = templateName && templates.some((t) => t.name === templateName && t.languageUI === templateLangUI);
    if (hasCurrent) return;

    const preferredName = (health?.default_template || defaultTemplate || "").trim();
    const preferredLangUI = toUiLang(health?.default_lang_api || language);

    const choice =
      (preferredName &&
        templates.find((t) => t.name === preferredName && t.languageUI === preferredLangUI && t.status === "APPROVED")) ||
      (preferredName && templates.find((t) => t.name === preferredName && t.status === "APPROVED")) ||
      templates.find((t) => t.status === "APPROVED") ||
      templates[0];

    if (choice) {
      setTemplateName(choice.name);
      setTemplateLangUI(choice.languageUI);
    }
  }, [templates, health, defaultTemplate, language, templateName, templateLangUI]);

  // window state (24h / template)
  const refreshWindow = async (force = false) => {
    if (!API || !user?.email || !lead?.id) return;
    const langApi = normApi(toApiLang(templateLangUI));
    const tpl = (templateName || "").trim();
    try {
      const url = `${API}/api/whatsapp/window-state?user_email=${encodeURIComponent(
        user.email
      )}&lead_id=${encodeURIComponent(lead.id)}&template_name=${encodeURIComponent(tpl)}&language_code=${encodeURIComponent(
        langApi
      )}${force ? "&force=1" : ""}`;
      const r = await fetch(url);
      const d = await r.json();
      setGate({
        inside24h: !!d.inside24h,
        canFreeText: !!d.canFreeText,
        canTemplate: !!d.canTemplate,
        templateApproved: !!d.templateApproved,
        templateStatus: String(d.templateStatus || "UNKNOWN").toUpperCase(),
      });
    } catch {}
  };
  useEffect(() => {
    refreshWindow(false);
  }, [API, user?.email, lead?.id, templateName, templateLangUI]); // eslint-disable-line
  useEffect(() => {
    refreshWindow(true);
  }, []); // eslint-disable-line

  /** --- template params (minimal) --- */
  const [expectedParams, setExpectedParams] = useState(null);
  const [paramValues, setParamValues] = useState([]);
  const [templateBodyText, setTemplateBodyText] = useState("");
  const [templateExample, setTemplateExample] = useState(null);
  const [paramKinds, setParamKinds] = useState([]); // NEW: inferred kinds for labels + autofill

  useEffect(() => {
    if (!API) return;
    const name = (templateName || "").trim();
    if (!name || name.toLowerCase() === "hello_world") {
      setExpectedParams(null);
      setTemplateBodyText("");
      setTemplateExample(null);
      setParamValues([]);
      setParamKinds([]);
      return;
    }
    (async () => {
      try {
        const r = await fetch(`${API}/api/whatsapp/template-info?name=${encodeURIComponent(name)}`);
        const j = await r.json();
        const t = (j.templates || [])[0];

        if (t) {
          const count = typeof t.body_param_count === "number" ? t.body_param_count : null;
          setExpectedParams(count);

          const comps = Array.isArray(t.components) ? t.components : [];
          const body = comps.find((c) => String(c.type || "").toUpperCase() === "BODY");
          const bodyText = body?.text || "";
          setTemplateBodyText(bodyText);

          const ex = body?.example?.body_text;
          setTemplateExample(Array.isArray(ex) && ex.length ? ex[0] : null);

          // infer param kinds for ANY template
          if (typeof count === "number" && count > 0) {
            const inferred = inferParamKindsFromBody(bodyText || "", count);
            setParamKinds(inferred);
            setParamValues((prev) => Array.from({ length: count }, (_, i) => prev?.[i] ?? ""));
          } else {
            setParamKinds([]);
            setParamValues([]);
          }
        } else {
          setExpectedParams(null);
          setTemplateBodyText("");
          setTemplateExample(null);
          setParamKinds([]);
          setParamValues([]);
        }
      } catch {
        setExpectedParams(null);
        setTemplateBodyText("");
        setTemplateExample(null);
        setParamKinds([]);
        setParamValues([]);
      }
    })();
  }, [API, templateName]);

  // Fill params for ANY template using inferred kinds + fallbacks
  const autofillParams = () => {
    if (typeof expectedParams !== "number" || expectedParams <= 0) return;
    const values = Array.from({ length: expectedParams }, (_, idx) => {
      const kind = paramKinds?.[idx];
      return valueForKind(kind, { user, lead, input, suggestion }) || "";
    });
    setParamValues(values);
  };

  /** --- composer --- */
  const [input, setInput] = useState("");
  const [banner, setBanner] = useState(null);

  const lastInbound = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      if (thread[i]?.from === "lead" && typeof thread[i]?.text === "string") {
        return thread[i].text;
      }
    }
    return "";
  }, [thread]);

  const canSendBase = Boolean(API && user?.email && lead?.id && toE164);

  /** ---- appointment suggestion state (+ persistence) ---- */
  const [suggestion, setSuggestion] = useState(null);
  const [consumedMap, setConsumedMap] = useState({});

  useEffect(() => {
    setConsumedMap(loadJSON(SUG_KEYS(user?.email).consumed, {}));
  }, [user?.email]);

  useEffect(() => {
    const s = parseApptFromText(lastInbound);
    if (!s || !user?.email || !lead?.id) {
      setSuggestion(null);
      return;
    }
    const sig = sigForSuggestion(lead.id, s);
    if (consumedMap[sig]) {
      setSuggestion(null);
      return;
    }
    setSuggestion({ ...s });
  }, [lastInbound, user?.email, lead?.id, consumedMap]);

  const markConsumed = (sug) => {
    if (!sug || !user?.email || !lead?.id) return;
    const key = SUG_KEYS(user?.email).consumed;
    const sig = sigForSuggestion(lead.id, sug);
    const next = { ...consumedMap, [sig]: true };
    setConsumedMap(next);
    saveJSON(key, next);
  };

  const onConfirmSuggestion = async () => {
    if (!suggestion || !user?.email || !lead?.id) return;
    try {
      const appointment_time = `${suggestion.date}T${suggestion.time}:00`;

      const payload = {
        lead_email: lead?.email || "",
        lead_first_name: (lead?.name || "").split(" ")[0] || (lead?.name || "Client"),
        user_name: user?.name || "",
        user_email: user?.email,
        business_name: user?.business || user?.businessType || "",
        appointment_time,
        appointment_location: lead?.location || user?.location || "TBD",
        duration: 30,
        notes: "Auto-created from WhatsApp confirmation",
      };

      const res = await fetch(`${API}/api/appointments/${encodeURIComponent(user.email)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await res.json();
      if (!res.ok) {
        setBanner(j?.error || `Failed to add appointment (${res.status})`);
        return;
      }

      setBanner(`Appointment added for ${suggestion.date} at ${suggestion.time}.`);
      markConsumed(suggestion);
      setSuggestion(null);
      ping("appointments:changed");

      setTimeout(async () => {
        try {
          const r = await fetch(
            `${API}/api/whatsapp/messages?user_email=${encodeURIComponent(user.email)}&lead_id=${encodeURIComponent(
              lead.id
            )}`
          );
          const jj = await r.json();
          setThread(Array.isArray(jj?.messages) ? jj.messages : []);
        } catch {}
      }, 250);
    } catch (e) {
      setBanner(e.message || "Failed to add appointment.");
    }
  };

  const onSend = async () => {
    if (!canSendBase || loading) return;
    const text = input.trim();
    setLoading(true);
    setBanner(null);
    try {
      const payload = {
        to: toE164,
        user_email: user.email,
        lead_id: lead.id,
      };

      if (gate.inside24h) {
        if (!text) {
          setBanner("Type a message to send inside the 24-hour session.");
          setLoading(false);
          return;
        }
        // EXACT raw text inside 24h — ask backend not to personalize (belt & suspenders)
        payload.message = text;
        payload.skip_personalization = true;
      } else {
        if (!templateName) {
          setBanner("Pick a template to send outside the 24-hour window.");
          setLoading(false);
          return;
        }
        payload.template_name = templateName;
        payload.language_code = normApi(toApiLang(templateLangUI));

        if (typeof expectedParams === "number" && expectedParams > 0) {
          const list = (paramValues || []).map((v) => String(v || "").trim()).slice(0, expectedParams);
          const missing = list.filter((v) => !v).length;
          if (missing) {
            setBanner(`This template needs ${expectedParams} parameters — ${missing} missing.`);
            setLoading(false);
            return;
          }
          payload.template_params = list;
        }
      }

      const res = await fetch(`${API}/api/whatsapp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setBanner(data?.error || `Send failed (${res.status})`);
        return;
      }

      setBanner(data.mode === "template" ? `Sent via template (${data.usedLanguage || "?"}).` : null);
      setInput("");
      if (typeof expectedParams === "number" && expectedParams > 0) {
        setParamValues(Array.from({ length: expectedParams }, () => ""));
      }

      setTimeout(async () => {
        try {
          const r = await fetch(
            `${API}/api/whatsapp/messages?user_email=${encodeURIComponent(user.email)}&lead_id=${encodeURIComponent(
              lead.id
            )}`
          );
          const j = await r.json();
          setThread(Array.isArray(j?.messages) ? j.messages : []);
        } catch {}
      }, 250);
    } catch (e) {
      setBanner(e.message || "Send failed.");
    } finally {
      setLoading(false);
    }
  };

  // Send on Ctrl/⌘+Enter
  const onKeyDown = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onSend();
  };

  // AI draft — strip headers/prefix from the generated text before inserting
  const onDraftAI = async () => {
    if (!API || !lead) return;
    setBanner(null);
    try {
      const body = {
        lead: { name: lead.name || "", tags: lead.tags || [], notes: lead.notes || "" },
        last_message: lastInbound || "",
        user_business: user?.business || user?.businessType || "business",
        user_name: user?.name || "",
      };
      const r = await fetch(`${API}/api/generate-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j?.reply) {
        const draft = cleanAIText(j.reply);
        setInput((prev) => (prev?.trim() ? prev.trim() + "\n\n" + draft : draft));
      } else {
        setBanner(j?.error || "AI couldn’t generate a reply.");
      }
    } catch (e) {
      setBanner(e.message || "AI draft failed.");
    }
  };

  /** --- Listen to Automations sends and show instantly in thread + log --- */
  useEffect(() => {
    const handler = (e) => {
      const items = (e?.detail?.items || []).filter(Boolean);
      if (!items.length || !lead || !user?.email) return;

      const leadEmail = String(lead.email || "").toLowerCase();
      const leadPhone = digits(lead.whatsapp || lead.phone);

      const matched = items.filter((it) => {
        const toLower = String(it.to || "").toLowerCase();
        const toDigits = digits(it.to || "");
        return (
          (leadEmail && toLower && toLower === leadEmail) ||
          (leadPhone && toDigits && (toDigits.endsWith(leadPhone) || leadPhone.endsWith(toDigits)))
        );
      });
      if (!matched.length) return;

      // append to thread (as "user" messages) + store in per-lead log
      const bubbles = matched.map((it) => ({
        from: "user",
        text: htmlToText(it.text || it.subject || it.html || ""),
        time: it.created_at || new Date().toISOString(),
      }));

      setThread((prev) => [...prev, ...bubbles]);

      const key = AUTO_LOG_KEY(user.email, lead.id);
      setAutoLog((prev) => {
        const next = [...prev, ...matched];
        try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
        return next;
      });
    };

    window.addEventListener("app:message-sent", handler);
    return () => window.removeEventListener("app:message-sent", handler);
  }, [lead, user?.email]);

  /** --- Detect WA template echoes from background engine --- */
  useEffect(() => {
    if (!user?.email || !lead?.id) return;
    // detect messages like: “[template:name/lang] body…”
    const detected = thread
      .filter((m) => m?.from === "user" && typeof m?.text === "string" && /^\[template:[^\/]+\/[^\]]+\]/i.test(m.text))
      .map((m) => {
        const text = String(m.text || "");
        return {
          id: `${m.time || ""}|${text.slice(0, 40)}`,
          channel: "whatsapp",
          status: "ok",
          to: lead.email || lead.whatsapp || "",
          text,
          subject: "",
          html: "",
          created_at: m.time || new Date().toISOString(),
          _detected: true,
        };
      });

    if (!detected.length) return;

    const key = AUTO_LOG_KEY(user.email, lead.id);
    setAutoLog((prev) => {
      // de-dup by created_at+text
      const seen = new Set(prev.map((x) => `${x.created_at}|${(x.text || x.subject || x.html || "").slice(0, 40)}`));
      const add = detected.filter((d) => !seen.has(`${d.created_at}|${(d.text || "").slice(0, 40)}`));
      if (!add.length) return prev;
      const next = [...prev, ...add];
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [thread, user?.email, lead?.id, lead?.email, lead?.whatsapp]);

  /** --- UI when no leads --- */
  if (!Array.isArray(leads) || !leads.length) {
    return (
      <div style={{ width: "100%", minHeight: "100vh", background: C.bg }}>
        <Header />
        <div style={{ color: C.sub, padding: 18 }}>Add a lead with a WhatsApp number to start chatting.</div>
      </div>
    );
  }

  const paramLabel = (i) => labelForKind(paramKinds?.[i], i);

  return (
    <div style={{ width: "100%", minHeight: "100vh", background: C.bg }}>
      <Header />

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 18 }}>
        {/* LEFT – chat list */}
        <div
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            overflow: "hidden",
            height: PANEL_H,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              height: 50,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0 12px",
              borderBottom: `1px solid ${C.border}`,
              color: C.text,
              fontWeight: 800,
            }}
          >
            <SiWhatsapp style={{ color: C.wa }} />
            Chats
          </div>

          <div style={{ padding: 10, borderBottom: `1px solid ${C.border}` }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              style={{
                width: "100%",
                background: C.bg,
                color: C.text,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {filteredLeads.map((ld) => {
              const active = String(ld.id) === String(activeLeadId);
              return (
                <button
                  key={ld.id}
                  onClick={() => setActiveLeadId(ld.id)}
                  style={{
                    width: "100%",
                    background: active ? C.header : "transparent",
                    border: 0,
                    borderBottom: `1px solid ${C.border}`,
                    color: C.text,
                    textAlign: "left",
                    cursor: "pointer",
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      background: C.header,
                      display: "grid",
                      placeItems: "center",
                      color: C.accent,
                      fontWeight: 800,
                      border: `1px solid ${C.border}`,
                      flex: "0 0 34px",
                    }}
                  >
                    {initials(ld.name, ld.email)}
                  </div>
                  <div style={{ overflow: "hidden" }}>
                    <div
                      style={{
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {ld.name || ld.email}
                    </div>
                    <div style={{ fontSize: 12, color: C.sub }}>{fmtNA(ld.phone || ld.whatsapp)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT – thread + composer */}
        <div
          key={activeLeadId}
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            height: PANEL_H,
            display: "grid",
            gridTemplateRows: suggestion
              ? gate.inside24h
                ? "56px auto 1fr auto"
                : "56px auto auto 1fr auto"
              : gate.inside24h
              ? "56px 1fr auto"
              : "56px auto 1fr auto",
            overflow: "hidden",
          }}
        >
          {/* Chat header */}
          <div
            style={{
              height: 56,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0 12px",
              borderBottom: `1px solid ${C.border}`,
              background: C.header,
              color: C.text,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: C.panel,
                display: "grid",
                placeItems: "center",
                color: C.accent,
                fontWeight: 800,
                border: `1px solid ${C.border}`,
                flex: "0 0 36px",
              }}
            >
              {initials(lead?.name, lead?.email)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800 }}>{lead?.name || lead?.email}</div>
              <div style={{ fontSize: 12, color: C.sub }}>{fmtNA(lead?.phone || lead?.whatsapp)}</div>
            </div>

            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              {/* Automation sends toggle */}
              <button
                onClick={() => setShowAutoLog((s) => !s)}
                style={{
                  background: "transparent",
                  color: C.accent,
                  border: `1px solid ${C.accent}`,
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
                title="Show messages sent by automations"
              >
                Automation sends ({autoLog.length})
              </button>

              <Pill
                color={gate.inside24h ? C.wa : C.accent}
                text={
                  gate.inside24h
                    ? "Inside 24h session"
                    : gate.templateApproved
                    ? "Outside 24h (template OK)"
                    : `Outside 24h (${gate.templateStatus})`
                }
              />
            </div>
          </div>

          {/* Template controls (only when needed) */}
          {!gate.inside24h && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                padding: "10px 12px",
                borderBottom: `1px solid ${C.border}`,
                background: C.panel,
              }}
            >
              <span style={{ color: C.sub, fontSize: 12 }}>Template</span>
              <select
                value={`${templateName}|${templateLangUI}`}
                onChange={(e) => {
                  const [n, l] = e.target.value.split("|");
                  setTemplateName(n);
                  setTemplateLangUI(l);
                  setTimeout(() => refreshWindow(true), 0);
                }}
                style={{
                  background: C.bg,
                  color: C.text,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: "6px 8px",
                  fontSize: 13,
                }}
              >
                {!templates.find((t) => t.name === templateName && t.languageUI === templateLangUI) && templateName && (
                  <option value={`${templateName}|${templateLangUI}`}>{templateName} ({templateLangUI})</option>
                )}
                {templates.map((t) => (
                  <option key={`${t.name}-${t.languageUI}`} value={`${t.name}|${t.languageUI}`}>
                    {t.name} ({t.languageUI}) {t.status === "APPROVED" ? "✓" : "•"}
                  </option>
                ))}
              </select>

              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button onClick={autofillParams} style={btn("ghost")} title="Autofill common fields">
                  Autofill
                </button>
                <button
                  onClick={() => setParamValues(Array.from({ length: expectedParams || 0 }, () => ""))}
                  style={btn("outline")}
                  title="Clear params"
                >
                  Clear
                </button>
              </div>

              {!!templateBodyText && (
                <div
                  style={{
                    width: "100%",
                    color: C.sub,
                    fontSize: 12,
                    lineHeight: 1.3,
                    marginTop: 4,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={templateBodyText}
                >
                  {templateBodyText}
                </div>
              )}

              {typeof expectedParams === "number" && expectedParams > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
                    gap: 8,
                    width: "100%",
                    marginTop: 8,
                  }}
                >
                  {Array.from({ length: expectedParams }).map((_, i) => (
                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, color: C.sub }}>{paramLabel(i)}</label>
                      <input
                        value={paramValues?.[i] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setParamValues((prev) => {
                            const next = Array.from({ length: expectedParams }, (_, idx) => prev?.[idx] ?? "");
                            next[i] = v;
                            return next;
                          });
                        }}
                        placeholder={templateExample?.[i] ?? `value for {{${i + 1}}}`}
                        style={{
                          background: C.bg,
                          color: C.text,
                          border: `1px solid ${C.border}`,
                          borderRadius: 10,
                          padding: "8px 10px",
                          fontSize: 13,
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Automation sends panel (toggle) */}
          {showAutoLog && (
            <div
              style={{
                padding: "8px 12px",
                borderBottom: `1px solid ${C.border}`,
                background: "#1e2326",
                maxHeight: 160,
                overflowY: "auto",
              }}
            >
              {autoLog.length === 0 ? (
                <div style={{ color: C.sub, fontSize: 12 }}>No automation messages yet for this lead.</div>
              ) : (
                autoLog
                  .slice()
                  .reverse()
                  .map((it, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px 1fr",
                        gap: 10,
                        padding: "6px 0",
                        borderBottom: idx === autoLog.length - 1 ? "0" : `1px dashed ${C.border}`,
                      }}
                    >
                      <div style={{ color: C.sub, fontSize: 12 }}>
                        {it.channel?.toUpperCase() || "AUTO"} ·{" "}
                        {new Date(it.created_at || Date.now()).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      <div style={{ color: C.text, fontSize: 13, whiteSpace: "pre-wrap" }}>
                        {htmlToText(it.text || it.subject || it.html || "")}
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}

          {/* Appointment suggestion banner */}
          {suggestion && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderBottom: `1px solid ${C.border}`,
                background: "#1e2326",
              }}
            >
              <span style={{ color: C.accent, fontWeight: 900 }}>Suggest appointment:</span>
              <span style={{ color: C.text, fontWeight: 800 }}>
                {new Date(`${suggestion.date}T${suggestion.time}:00`).toLocaleString([], {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button style={btn("primary")} onClick={onConfirmSuggestion}>
                  Add to Calendar
                </button>
                <button
                  style={btn("ghost")}
                  onClick={() => {
                    markConsumed(suggestion);
                    setSuggestion(null);
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Thread */}
          <div
            ref={chatRef}
            style={{
              overflowY: "auto",
              padding: "14px 16px",
              backgroundImage:
                "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),radial-gradient(rgba(255,255,255,0.02) 1px, transparent 1px)",
              backgroundSize: "24px 24px, 48px 48px",
              backgroundPosition: "0 0, 12px 12px",
              paddingBottom: 110,
            }}
          >
            {thread.length === 0 && <div style={{ textAlign: "center", color: C.sub, marginTop: 8 }}>No messages yet. Say hello 👋</div>}
            {thread.map((m, i) => (
              <Bubble key={i} from={m.from} text={m.text} time={m.time} />
            ))}
          </div>

          {/* Composer */}
          <div style={{ background: C.panel, borderTop: `1px solid ${C.border}` }}>
            {banner && (
              <div
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  color: "#d2b48c",
                  background: "#3a2a18",
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                {banner}
              </div>
            )}
            <div style={{ padding: 10 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <textarea
                  rows={3}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={
                    !toE164
                      ? "No WhatsApp number on this lead"
                      : gate.inside24h
                      ? "Type a message…  (Ctrl/⌘ + Enter to send)"
                      : typeof expectedParams === "number" && expectedParams > 0
                      ? "Outside 24h — fill the params above and add any extra details here"
                      : "Outside 24h — pick a template"
                  }
                  style={{
                    flex: 1,
                    resize: "none",
                    background: C.bg,
                    color: C.text,
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    padding: "12px 14px",
                    fontSize: 15,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  disabled={!canSendBase}
                  maxLength={2000}
                />

                <button onClick={onDraftAI} disabled={!canSendBase} style={btn("ghost", !canSendBase)} title="Draft with AI">
                  AI Reply
                </button>

                <button onClick={onSend} disabled={!canSendBase || loading} style={btn("primary", !canSendBase || loading)} title="Send (Ctrl/⌘ + Enter)">
                  {loading ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ===== small UI atoms ===== */
function Header() {
  return (
    <div
      style={{
        padding: "0 0 18px 0",
        borderBottom: `1px solid ${C.border}`,
        marginBottom: 18,
      }}
    >
      <h2
        style={{
          color: C.text,
          fontWeight: 900,
          margin: 0,
          letterSpacing: "-0.5px",
          fontSize: 28,
        }}
      >
        Messages
      </h2>
    </div>
  );
}

function Pill({ color, text }) {
  return (
    <span
      style={{
        background: "transparent",
        color,
        border: `1px solid ${color}`,
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function btn(kind, disabled = false) {
  const base = {
    minWidth: 120,
    border: 0,
    borderRadius: 999,
    padding: "12px 18px",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
  };

  if (kind === "primary") {
    return {
      ...base,
      background: C.accent,
      color: "#1a1a1a",
      opacity: disabled ? 0.7 : 1,
    };
  }
  if (kind === "outline") {
    return {
      ...base,
      background: "transparent",
      color: C.accent,
      border: `2px solid ${C.accent}`,
      opacity: disabled ? 0.7 : 1,
    };
  }
  // ghost
  return {
    ...base,
    background: "#1e2a30",
    color: C.text,
    opacity: disabled ? 0.7 : 1,
  };
}

function Bubble({ from, text, time }) {
  const you = from === "user";
  const safe = cleanAIText(text);
  return (
    <div
      style={{
        display: "flex",
        justifyContent: you ? "flex-end" : "flex-start",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          maxWidth: "88%",
          background: you ? C.out : C.in,
          color: C.text,
          border: `1px solid ${C.border}`,
          borderRadius: you ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          padding: "10px 12px",
          boxShadow: "0 1px 1px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 15 }}>{safe}</div>
        <div style={{ fontSize: 11, color: C.sub, textAlign: "right", marginTop: 6 }}>
          {time
            ? new Date(time).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : ""}
        </div>
      </div>
    </div>
  );
}
