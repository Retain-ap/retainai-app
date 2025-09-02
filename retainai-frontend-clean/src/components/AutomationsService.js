// src/components/AutomationsService.js
const BASE = process.env.REACT_APP_API_URL || "";
const ROOT = `${BASE}/api/automations`;

async function jfetch(
  url,
  { method = "GET", headers = {}, body, userEmail } = {}
) {
  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(userEmail ? { "X-User-Email": userEmail } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch (_) {}
  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data || {};
}

/* ----------------- helpers ----------------- */
function htmlToText(s) {
  if (!s) return "";
  let t = String(s);
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/p>\s*<p>/gi, "\n\n");
  t = t.replace(/<\/?[^>]+>/g, "");
  return t.trim();
}

function cryptoRandomId() {
  try {
    return [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return String(Math.random()).slice(2);
  }
}

function dispatchAutomationSent(items = []) {
  if (!Array.isArray(items) || !items.length) return;
  const normed = items.map((it) => {
    const type = it.type || it.kind || "";
    const info = it.info || {};
    const channel =
      it.channel ||
      (type.includes("whatsapp")
        ? "whatsapp"
        : type.includes("email")
        ? "email"
        : "unknown");
    const text =
      (info.text && String(info.text)) ||
      (info.subject && info.html
        ? `${info.subject}\n\n${htmlToText(info.html)}`
        : info.subject || info.html || "");
    return {
      id: it.id || cryptoRandomId(),
      channel,
      status: it.status || "ok",
      to: info.to || it.to || "",
      text: htmlToText(text),
      subject: info.subject || "",
      html: info.html || "",
      created_at: new Date().toISOString(),
    };
  });

  try {
    window.dispatchEvent(
      new CustomEvent("app:message-sent", {
        detail: { source: "automations", items: normed },
      })
    );
  } catch {}
}

/* ---------------- AUTOMATIONS ---------------- */
async function getTemplates() {
  return jfetch(`${ROOT}/templates`);
}
async function getProfile(userEmail) {
  return jfetch(`${ROOT}/user/profile`, { userEmail });
}
async function saveProfile(userEmail, profile) {
  return jfetch(`${ROOT}/user/profile`, {
    method: "POST",
    userEmail,
    body: profile,
  });
}
async function listFlows(userEmail) {
  return jfetch(`${ROOT}/`, { userEmail });
}
async function createFlow(userEmail, flow) {
  return jfetch(`${ROOT}/`, { method: "POST", userEmail, body: { flow } });
}
async function updateFlow(userEmail, flowId, flow) {
  return jfetch(`${ROOT}/${encodeURIComponent(flowId)}`, {
    method: "PUT",
    userEmail,
    body: { flow },
  });
}
async function deleteFlow(userEmail, flowId) {
  return jfetch(`${ROOT}/${encodeURIComponent(flowId)}`, {
    method: "DELETE",
    userEmail,
  });
}
async function enableFlow(userEmail, flowId, enabled) {
  return jfetch(`${ROOT}/enable/${encodeURIComponent(flowId)}`, {
    method: "POST",
    userEmail,
    body: { enabled },
  });
}

/* Preview / Test */
async function dryRun(userEmail, flowOrId, opts = {}) {
  const lead_email = opts.lead_email || opts.leadEmail || "";
  const body = {
    mode: "dryrun",
    lead_email,
    ...(typeof flowOrId === "object"
      ? { flow: flowOrId }
      : { flow_id: String(flowOrId) }),
    ...(opts.profile ? { profile: opts.profile } : {}),
  };
  return jfetch(`${ROOT}/test`, { method: "POST", userEmail, body });
}

async function executeNow(userEmail, flowOrId, opts = {}) {
  const lead_email = opts.lead_email || opts.leadEmail || "";
  const body = {
    mode: "execute",
    lead_email,
    ignore_waits: opts.ignore_waits !== false,
    ignore_quiet_hours: opts.ignore_quiet_hours !== false,
    bypass_rate_limits: opts.bypass_rate_limits !== false,
    ...(typeof flowOrId === "object"
      ? { flow: flowOrId }
      : { flow_id: String(flowOrId) }),
  };
  const data = await jfetch(`${ROOT}/test`, { method: "POST", userEmail, body });
  const executed = Array.isArray(data?.did)
    ? data.did
    : Array.isArray(data?.actions)
    ? data.actions
    : [];
  if (executed.length) {
    const withTo = executed.map((x) => ({
      ...x,
      info: { ...(x.info || {}), to: (x.info && x.info.to) || lead_email },
    }));
    dispatchAutomationSent(withTo);
  }
  return data;
}

async function runEngineOnce() {
  return jfetch(`${ROOT}/run`, { method: "POST" });
}

/* ---------------- WHATSAPP (message templates etc.) ---------------- */
// These endpoints are provided by your backend WhatsApp module.
async function getMsgTemplates() {
  return jfetch(`${BASE}/api/whatsapp/templates`);
}
async function getMsgTemplateInfo(name) {
  return jfetch(
    `${BASE}/api/whatsapp/template-info?name=${encodeURIComponent(name)}`
  );
}
async function getMsgHealth() {
  return jfetch(`${BASE}/api/whatsapp/health`);
}
async function getMsgWindowState({
  userEmail,
  leadId,
  templateName,
  languageCode,
  force = false,
}) {
  const url = `${BASE}/api/whatsapp/window-state?user_email=${encodeURIComponent(
    userEmail
  )}&lead_id=${encodeURIComponent(
    leadId
  )}&template_name=${encodeURIComponent(
    templateName || ""
  )}&language_code=${encodeURIComponent(languageCode || "en")}${
    force ? "&force=1" : ""
  }`;
  return jfetch(url);
}
async function sendWhatsApp(payload) {
  return jfetch(`${BASE}/api/whatsapp/send`, { method: "POST", body: payload });
}
async function getWhatsAppMessages({ userEmail, leadId }) {
  const url = `${BASE}/api/whatsapp/messages?user_email=${encodeURIComponent(
    userEmail
  )}&lead_id=${encodeURIComponent(leadId)}`;
  return jfetch(url);
}

const api = {
  // automations
  getTemplates,
  getProfile,
  saveProfile,
  listFlows,
  createFlow,
  updateFlow,
  deleteFlow,
  enableFlow,
  dryRun,
  executeNow,
  runEngineOnce,
  // whatsapp / templates
  getMsgTemplates,
  getMsgTemplateInfo,
  getMsgHealth,
  getMsgWindowState,
  sendWhatsApp,
  getWhatsAppMessages,
};

export default api;
