# RetainAI — app.py (Prod, consolidated)
# ======================================
# Key properties:
# - Per-user leads persisted in data/leads.json (atomic writes).
# - Stable lead IDs, CRUD + notes.
# - Stripe-gated auth (login allowed only after webhook activates account).
# - WhatsApp API + webhook (24h window + opt-out) — in Part 3.
# - Google Calendar OAuth + fetch — in Part 2.
# - Appointments with ICS & SendGrid — in Part 2.
# - APScheduler fallback so deploys never crash if package/env missing (Part 3 starts it only when ENABLE_SCHEDULER=1).
# - No Flask 3 deprecated hooks (e.g., before_first_request).

from __future__ import annotations

import os, re, json, hmac, hashlib, datetime
from datetime import datetime as dt, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode, quote, quote_plus

import requests as pyrequests
from flask import Flask, request, jsonify, send_from_directory, redirect, Blueprint
from flask_cors import CORS
from dotenv import load_dotenv

# --- Optional libs (present in Part 2/3 as needed) ---------------------------
# Stripe, SendGrid, Google libs are imported later in this file where used.

# --- APScheduler fallback so import never crashes ----------------------------
try:
    from flask_apscheduler import APScheduler  # real one
except Exception:
    class APScheduler:  # no-op fallback
        def init_app(self, app): pass
        def start(self): pass
        def shutdown(self, wait: bool = False): pass
        def add_job(self, id: str, func, trigger: str, **kw): pass

# ----------------------------
# Environment
# ----------------------------
if os.getenv("FLASK_ENV") != "production":
    try:
        load_dotenv()
    except Exception:
        pass

# ----------------------------
# Flask + CORS
# ----------------------------
app = Flask(__name__)
FRONTEND_URL = (os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")
CORS(
    app,
    resources={r"/api/*": {
        "origins": [FRONTEND_URL, "http://localhost:3000", "http://127.0.0.1:3000",
                    "https://app.retainai.ca", "https://retainai.ca"]
    }},
    supports_credentials=True
)
app.logger.info("[BOOT] RetainAI backend starting")

# ----------------------------
# Storage (single DATA_DIR)
# ----------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.getenv("DATA_DIR", os.path.join(BASE_DIR, "data"))
os.makedirs(DATA_DIR, exist_ok=True)

LEADS_FILE         = os.path.join(DATA_DIR, "leads.json")
USERS_FILE         = os.path.join(DATA_DIR, "users.json")
NOTIFICATIONS_FILE = os.path.join(DATA_DIR, "notifications.json")
APPOINTMENTS_FILE  = os.path.join(DATA_DIR, "appointments.json")
CHAT_FILE          = os.path.join(DATA_DIR, "whatsapp_chats.json")
STATUS_FILE        = os.path.join(DATA_DIR, "whatsapp_status.json")
NOTES_FILE         = os.path.join(DATA_DIR, "notes.json")
ICS_DIR            = os.path.join(DATA_DIR, "ics_files")
os.makedirs(ICS_DIR, exist_ok=True)

# WhatsApp env (full stack in Part 3)
WHATSAPP_TOKEN            = os.getenv("WHATSAPP_TOKEN") or os.getenv("WHATSAPP_ACCESS_TOKEN")
WHATSAPP_PHONE_ID         = os.getenv("WHATSAPP_PHONE_ID") or os.getenv("WHATSAPP_PHONE_NUMBER_ID")
WHATSAPP_VERIFY_TOKEN     = os.getenv("WHATSAPP_VERIFY_TOKEN", "retainai-verify")
WHATSAPP_WABA_ID          = os.getenv("WHATSAPP_WABA_ID") or os.getenv("WHATSAPP_BUSINESS_ID")
WHATSAPP_TEMPLATE_DEFAULT = os.getenv("WHATSAPP_TEMPLATE_DEFAULT", "")
WHATSAPP_TEMPLATE_LANG    = os.getenv("WHATSAPP_TEMPLATE_LANG", "en_US")
WHATSAPP_API_VERSION      = os.getenv("WHATSAPP_API_VERSION", "v20.0")
DEFAULT_COUNTRY_CODE      = (os.getenv("DEFAULT_COUNTRY_CODE") or "1").strip()
META_APP_SECRET           = os.getenv("APP_SECRET") or os.getenv("META_APP_SECRET")

# Emails (SendGrid used in Part 2)
SENDGRID_API_KEY   = os.getenv("SENDGRID_API_KEY")
SENDER_EMAIL       = os.getenv("SENDER_EMAIL", "noreply@retainai.ca")

# Stripe (full endpoints in Part 2)
STRIPE_SECRET_KEY         = os.getenv("STRIPE_SECRET_KEY")
STRIPE_PRICE_ID           = os.getenv("STRIPE_PRICE_ID")
STRIPE_WEBHOOK_SECRET     = os.getenv("STRIPE_WEBHOOK_SECRET")
STRIPE_CONNECT_CLIENT_ID  = os.getenv("STRIPE_CONNECT_CLIENT_ID")
STRIPE_REDIRECT_URI       = os.getenv("STRIPE_REDIRECT_URI")

# Google OAuth (Part 2)
GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI  = os.getenv("GOOGLE_REDIRECT_URI")

# Admin (scheduler control; Part 3)
ADMIN_KEY = os.getenv("ADMIN_KEY", "")

# ----------------------------
# JSON helpers (atomic I/O)
# ----------------------------
def load_json(path: str, default: Any = None):
    if not os.path.exists(path):
        return default if default is not None else {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default if default is not None else {}

def save_json(path: str, data: Any):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)

# Thin wrappers
def load_leads():          return load_json(LEADS_FILE, {})
def save_leads(d):         save_json(LEADS_FILE, d)
def load_users():          return load_json(USERS_FILE, {})
def save_users(d):         save_json(USERS_FILE, d)
def load_notifications():  return load_json(NOTIFICATIONS_FILE, {})
def save_notifications(d): save_json(NOTIFICATIONS_FILE, d)
def load_appointments():   return load_json(APPOINTMENTS_FILE, {})
def save_appointments(d):  save_json(APPOINTMENTS_FILE, d)
def load_chats():          return load_json(CHAT_FILE, {})
def save_chats(d):         save_json(CHAT_FILE, d)
def load_statuses():       return load_json(STATUS_FILE, {})
def save_statuses(d):      save_json(STATUS_FILE, d)
def load_notes():          return load_json(NOTES_FILE, {})
def save_notes(d):         save_json(NOTES_FILE, d)

# ----------------------------
# Utils
# ----------------------------
def _now_iso() -> str:
    return dt.utcnow().isoformat() + "Z"

def _gen_id(n: int = 12) -> str:
    return os.urandom(n).hex()

def _email_key(s: str) -> str:
    return (s or "").strip().lower()

def _ensure_user_bucket(obj: Dict[str, Any], user_email: str):
    k = _email_key(user_email)
    if k not in obj:
        obj[k] = []
    return obj

# ----------------------------
# Health / root
# ----------------------------
@app.get("/healthz")
def healthz():
    return "ok", 200

@app.get("/")
def root():
    return jsonify({"ok": True, "service": "RetainAI API", "time": _now_iso()})

# =============================================================================
# Leads CRUD (bulletproof, per-user)
# =============================================================================

# Shape of a lead:
# {
#   "id": "abc123",
#   "name": "Jane Doe",
#   "email": "jane@example.com",
#   "phone": "15551234567",
#   "whatsapp": "15551234567",
#   "tags": ["vip"],
#   "createdAt": "...Z",
#   "updatedAt": "...Z",
#   "last_contacted": "...Z",
#   "wa_opt_out": false
# }

@app.get("/api/leads/<path:user_email>")
def list_leads(user_email):
    user_email = _email_key(user_email)
    leads = load_leads()
    return jsonify({"leads": leads.get(user_email, [])}), 200

@app.post("/api/leads/<path:user_email>")
def create_lead(user_email):
    user_email = _email_key(user_email)
    payload = request.get_json(force=True, silent=True) or {}
    name  = (payload.get("name") or "").strip()
    email = _email_key(payload.get("email") or "")
    phone = (payload.get("phone") or "").strip()
    wapp  = (payload.get("whatsapp") or phone or "").strip()
    tags  = payload.get("tags") or []

    if not (name or email or phone or wapp):
        return jsonify({"error": "Provide at least one of: name, email, phone/whatsapp"}), 400

    leads = load_leads()
    _ensure_user_bucket(leads, user_email)

    # prevent exact duplicate by email for same user
    if email:
        for ld in leads[user_email]:
            if _email_key(ld.get("email")) == email:
                return jsonify({"error": "Lead with this email already exists", "lead": ld}), 409

    lead = {
        "id": _gen_id(8),
        "name": name,
        "email": email,
        "phone": phone,
        "whatsapp": wapp,
        "tags": tags if isinstance(tags, list) else [],
        "createdAt": _now_iso(),
        "updatedAt": _now_iso(),
        "last_contacted": None,
        "wa_opt_out": False,
    }
    leads[user_email].append(lead)
    save_leads(leads)
    return jsonify({"lead": lead}), 201

@app.put("/api/leads/<path:user_email>/<lead_id>")
def update_lead(user_email, lead_id):
    user_email = _email_key(user_email)
    payload = request.get_json(force=True, silent=True) or {}
    leads = load_leads()
    arr = leads.get(user_email, [])
    updated = None
    for i, ld in enumerate(arr):
        if str(ld.get("id")) == str(lead_id):
            # safe fields to update
            for key in ("name","email","phone","whatsapp","tags","last_contacted"):
                if key in payload:
                    if key == "email":
                        ld[key] = _email_key(payload[key] or "")
                    else:
                        ld[key] = payload[key]
            ld["updatedAt"] = _now_iso()
            arr[i] = updated = ld
            break
    leads[user_email] = arr
    save_leads(leads)
    if not updated:
        return jsonify({"error": "Lead not found"}), 404
    return jsonify({"lead": updated}), 200

@app.delete("/api/leads/<path:user_email>/<lead_id>")
def delete_lead(user_email, lead_id):
    user_email = _email_key(user_email)
    leads = load_leads()
    arr = leads.get(user_email, [])
    before = len(arr)
    arr = [ld for ld in arr if str(ld.get("id")) != str(lead_id)]
    leads[user_email] = arr
    save_leads(leads)

    # also remove notes & chats for this lead
    notes = load_notes()
    if user_email in notes:
        notes[user_email] = [n for n in notes[user_email] if str(n.get("lead_id")) != str(lead_id)]
        save_notes(notes)
    chats = load_chats()
    if user_email in chats:
        chats[user_email].pop(str(lead_id), None)
        save_chats(chats)

    return jsonify({"deleted": before - len(arr)}), 200

@app.get("/api/leads/search")
def search_leads():
    user_email = _email_key(request.args.get("user_email") or "")
    q = (request.args.get("q") or "").strip().lower()
    if not user_email:
        return jsonify({"error": "user_email required"}), 400
    leads = load_leads().get(user_email, [])
    if not q:
        return jsonify({"leads": leads}), 200
    out = []
    for ld in leads:
        blob = " ".join([
            (ld.get("name") or ""),
            (ld.get("email") or ""),
            (ld.get("phone") or ""),
            (ld.get("whatsapp") or ""),
            " ".join(ld.get("tags") or [])
        ]).lower()
        if q in blob:
            out.append(ld)
    return jsonify({"leads": out}), 200

# =============================================================================
# Lead Notes (per-user, per-lead) — keeps UI “add note” from breaking
# =============================================================================

# Note shape:
# { "id": "...", "lead_id": "...", "user_email": "...", "text": "...", "createdAt": "...Z" }

@app.get("/api/notes/<lead_id>")
def list_notes(lead_id):
    user_email = _email_key(request.args.get("user_email") or "")
    if not user_email:
        return jsonify({"error": "user_email required"}), 400
    notes = load_notes().get(user_email, [])
    notes = [n for n in notes if str(n.get("lead_id")) == str(lead_id)]
    return jsonify({"notes": notes}), 200

@app.post("/api/notes/<lead_id>")
def add_note(lead_id):
    user_email = _email_key(request.args.get("user_email") or (request.json or {}).get("user_email") or "")
    body = request.get_json(force=True, silent=True) or {}
    text = (body.get("text") or "").strip()
    if not user_email:
        return jsonify({"error": "user_email required"}), 400
    if not text:
        return jsonify({"error": "text required"}), 400

    # verify lead exists
    leads = load_leads().get(user_email, [])
    if not any(str(ld.get("id")) == str(lead_id) for ld in leads):
        return jsonify({"error": "Lead not found"}), 404

    notes = load_notes()
    if user_email not in notes:
        notes[user_email] = []
    note = {
        "id": _gen_id(8),
        "lead_id": str(lead_id),
        "user_email": user_email,
        "text": text,
        "createdAt": _now_iso(),
    }
    notes[user_email].append(note)
    save_notes(notes)
    return jsonify({"note": note}), 201

# =============================================================================
# Notifications (lightweight; UI badge support)
# =============================================================================

@app.get("/api/notifications/<path:user_email>")
def get_notifications(user_email):
    user_email = _email_key(user_email)
    notes = load_notifications().get(user_email, [])
    return jsonify({"notifications": notes}), 200

@app.post("/api/notifications/<path:user_email>/readall")
def mark_notifications_read(user_email):
    user_email = _email_key(user_email)
    alln = load_notifications()
    arr = alln.get(user_email, [])
    for n in arr:
        n["read"] = True
    alln[user_email] = arr
    save_notifications(alln)
    return jsonify({"ok": True}), 200
# =============================================================================
# SendGrid helpers (safe if key missing)
# =============================================================================
try:
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail, Email
except Exception:
    SendGridAPIClient = None
    class Mail:  # type: ignore
        def __init__(self, *a, **k): pass
    class Email:  # type: ignore
        def __init__(self, *a, **k): pass

SG_TEMPLATE_APPT_CONFIRM       = os.getenv("SG_TEMPLATE_APPT_CONFIRM", "d-8101601827b94125b6a6a167c4455719")
SG_TEMPLATE_FOLLOWUP_USER      = os.getenv("SG_TEMPLATE_FOLLOWUP_USER", "d-f239cca5f5634b01ac376a8b8690ef10")
SG_TEMPLATE_WELCOME            = os.getenv("SG_TEMPLATE_WELCOME", "d-d4051648842b44098e601a3b16190cf9")
SG_TEMPLATE_BIRTHDAY           = os.getenv("SG_TEMPLATE_BIRTHDAY", "d-94133232d9bd48e0864e21dce34158d3")
SG_TEMPLATE_TRIAL_ENDING       = os.getenv("SG_TEMPLATE_TRIAL_ENDING", "d-b7329a138d5b40b096da3ff965407845")
SG_TEMPLATE_FOLLOWUP_LEAD      = os.getenv("SG_TEMPLATE_FOLLOWUP_LEAD", "d-b40c227ed00e4cd29fdeb10dcc71a268")
SG_TEMPLATE_REENGAGE_LEAD      = os.getenv("SG_TEMPLATE_REENGAGE_LEAD", "d-9c6ac36680c8473a84dda817fb58e7b7")
SG_TEMPLATE_APOLOGY_LEAD       = os.getenv("SG_TEMPLATE_APOLOGY_LEAD", "d-64abfc217ce443d59c2cb411fc85cc74")
SG_TEMPLATE_UPSELL_LEAD        = os.getenv("SG_TEMPLATE_UPSELL_LEAD", "d-a7a2c04c57e344aebd6a94559ae71ea9")
SG_TEMPLATE_BDAY_REMINDER_USER = os.getenv("SG_TEMPLATE_BDAY_REMINDER_USER", "d-599937685fc544ecb756d9fdb8275a9b")

def send_email_with_template(to_email, template_id, dynamic_data, subject=None, from_email=None, reply_to_email=None):
    if not SENDGRID_API_KEY or not SendGridAPIClient:
        app.logger.info("[SENDGRID] missing API key or client; skipping send (simulated)")
        return True
    from_email = from_email or SENDER_EMAIL
    subject = subject or (dynamic_data or {}).get("subject") or "Message"
    msg = Mail(from_email=from_email, to_emails=to_email, subject=subject)
    msg.template_id = template_id
    try:
        # some sendgrid libs require dict for dynamic data
        msg.dynamic_template_data = dict(dynamic_data or {})
    except Exception:
        msg.dynamic_template_data = dynamic_data or {}
    if reply_to_email:
        msg.reply_to = Email(reply_to_email)
    try:
        resp = SendGridAPIClient(SENDGRID_API_KEY).send(msg)
        app.logger.info("[SENDGRID] status=%s to=%s subj=%s", resp.status_code, to_email, subject)
        return 200 <= resp.status_code < 300
    except Exception as e:
        app.logger.error("[SENDGRID ERROR] %s", e)
        return False

def send_welcome_email(to_email, user_name=None, business_type=None):
    send_email_with_template(
        to_email=to_email,
        template_id=SG_TEMPLATE_WELCOME,
        dynamic_data={"user_name": user_name or "", "business_type": business_type or ""},
        from_email="welcome@retainai.ca",
    )

def log_notification(user_email, subject, message, lead_email=None):
    notes = load_notifications()
    notes.setdefault(_email_key(user_email), []).append({
        "timestamp": _now_iso(),
        "subject": subject,
        "message": message,
        "lead_email": lead_email,
        "read": False,
    })
    save_notifications(notes)

# =============================================================================
# ICS / Calendar helpers for Appointments
# =============================================================================
def create_ics_file(appt: Dict[str, Any]) -> str:
    uid = appt.get("id")
    start = datetime.datetime.strptime(appt["appointment_time"], "%Y-%m-%dT%H:%M:%S")
    end   = start + datetime.timedelta(minutes=int(appt.get("duration", 30)))
    summary = f"Appointment with {appt['user_name']} at {appt['business_name']}"
    description = f"Appointment at {appt['appointment_location']} with {appt['user_name']}"
    ics = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//RetainAI//EN
BEGIN:VEVENT
UID:{uid}
DTSTAMP:{start.strftime('%Y%m%dT%H%M%SZ')}
DTSTART:{start.strftime('%Y%m%dT%H%M%SZ')}
DTEND:{end.strftime('%Y%m%dT%H%M%SZ')}
SUMMARY:{summary}
DESCRIPTION:{description}
LOCATION:{appt['appointment_location']}
END:VEVENT
END:VCALENDAR
"""
    fname = f"{uid}.ics"
    with open(os.path.join(ICS_DIR, fname), "w", encoding="utf-8") as f:
        f.write(ics)
    return fname

@app.route("/ics/<filename>")
def serve_ics(filename):
    return send_from_directory(ICS_DIR, filename, as_attachment=True)

def make_google_calendar_link(appt: Dict[str, Any]) -> str:
    start = datetime.datetime.strptime(appt["appointment_time"], "%Y-%m-%dT%H:%M:%S")
    end   = start + datetime.timedelta(minutes=int(appt.get("duration", 30)))
    start_str = start.strftime("%Y%m%dT%H%M%SZ")
    end_str   = end.strftime("%Y%m%dT%H%M%SZ")
    title = f"Appointment with {appt['user_name']} at {appt['business_name']}"
    location = quote_plus(appt["appointment_location"])
    details  = quote_plus(f"Appointment with {appt['user_name']} at {appt['business_name']}.")
    return (
        "https://calendar.google.com/calendar/render?action=TEMPLATE"
        f"&text={quote_plus(title)}"
        f"&dates={start_str}/{end_str}"
        f"&details={details}"
        f"&location={location}"
    )

# =============================================================================
# Appointments API (create + email + ICS; list/update/delete)
# =============================================================================
@app.route('/api/appointments/<path:user_email>', methods=['GET'])
def get_appointments(user_email):
    data = load_appointments()
    return jsonify({"appointments": data.get(_email_key(user_email), [])}), 200

@app.route('/api/appointments/<path:user_email>', methods=['POST'])
def create_appointment(user_email):
    data = request.get_json(force=True, silent=True) or {}
    appt = {
        "id": _gen_id(8),
        "lead_email": data['lead_email'],
        "lead_first_name": data.get('lead_first_name') or (data.get("lead_name") or ""),
        "user_name": data['user_name'],
        "user_email": _email_key(data['user_email']),
        "business_name": data['business_name'],
        "appointment_time": data['appointment_time'],  # "YYYY-MM-DDTHH:MM:SS"
        "appointment_location": data['appointment_location'],
        "duration": int(data.get('duration', 30)),
        "notes": data.get('notes', ""),
    }
    appointments = load_appointments()
    key = _email_key(user_email)
    appointments.setdefault(key, []).append(appt)
    save_appointments(appointments)
    create_ics_file(appt)

    # email confirmation (best-effort)
    try:
        display_time = datetime.datetime.strptime(appt['appointment_time'], "%Y-%m-%dT%H:%M:%S").strftime("%B %d, %Y, %I:%M %p")
        ics_file_url = f"{request.host_url.rstrip('/')}/ics/{appt['id']}.ics"
        gcal_link    = make_google_calendar_link(appt)
        send_email_with_template(
            to_email=appt['lead_email'],
            template_id=SG_TEMPLATE_APPT_CONFIRM,
            dynamic_data={
                "lead_first_name": appt["lead_first_name"],
                "user_name": appt["user_name"],
                "business_name": appt["business_name"],
                "display_time": display_time,
                "appointment_location": appt["appointment_location"],
                "google_calendar_link": gcal_link,
                "ics_file_url": ics_file_url,
                "user_email": appt["user_email"],
            },
        )
    except Exception as e:
        app.logger.warning("[APPT EMAIL WARN] %s", e)

    return jsonify({"message": "Appointment created", "appointment": appt}), 201

@app.route('/api/appointments/<path:user_email>/<appt_id>', methods=['PUT'])
def update_appointment(user_email, appt_id):
    data = request.get_json(force=True, silent=True) or {}
    appointments = load_appointments()
    key = _email_key(user_email)
    arr = appointments.get(key, [])
    updated = None
    for i, ap in enumerate(arr):
        if ap['id'] == appt_id:
            ap.update({k: v for k, v in data.items() if k in {
                "lead_email","lead_first_name","user_name","user_email","business_name",
                "appointment_time","appointment_location","duration","notes"
            }})
            arr[i] = updated = ap
            try: create_ics_file(ap)
            except Exception: pass
            break
    appointments[key] = arr
    save_appointments(appointments)
    return jsonify({"updated": bool(updated), "appointment": updated}), 200

@app.route('/api/appointments/<path:user_email>/<appt_id>', methods=['DELETE'])
def delete_appointment(user_email, appt_id):
    appointments = load_appointments()
    key = _email_key(user_email)
    arr = appointments.get(key, [])
    before = len(arr)
    arr = [a for a in arr if a['id'] != appt_id]
    appointments[key] = arr
    save_appointments(appointments)
    f = os.path.join(ICS_DIR, f"{appt_id}.ics")
    if os.path.exists(f):
        try: os.remove(f)
        except Exception: pass
    return jsonify({"deleted": before - len(arr)}), 200

# =============================================================================
# Auth + Stripe-gated access
#   - /api/signup returns Checkout URL, sets status=pending_payment
#   - /api/login succeeds only if user exists AND status == "active"
#   - /api/stripe/webhook marks user active on completed checkout
# =============================================================================
try:
    import stripe
    stripe.api_key = STRIPE_SECRET_KEY
except Exception:
    stripe = None

ZERO_DECIMAL = {"bif","clp","djf","gnf","jpy","kmf","krw","mga","pyg","rwf","ugx","vnd","vuv","xaf","xof","xpf"}

def to_minor(amount, currency):
    c = (currency or "usd").lower()
    return int(round(float(amount) * (1 if c in ZERO_DECIMAL else 100)))

def from_minor(value, currency):
    c = (currency or "usd").lower()
    d = 1 if c in ZERO_DECIMAL else 100.0
    return (value or 0) / d

def get_connected_acct(user_email: str):
    users = load_users()
    return (users.get(_email_key(user_email), {}) or {}).get("stripe_account_id")

@app.route('/api/signup', methods=['POST'])
def signup():
    if not stripe or not STRIPE_PRICE_ID:
        return jsonify({'error': 'Billing not configured'}), 503

    data = request.get_json(force=True, silent=True) or {}
    email        = _email_key(data.get('email') or '')
    password     = (data.get('password') or '').strip()
    businessType = (data.get('businessType') or '').strip()
    businessName = (data.get('businessName') or businessType or '').strip()
    name         = (data.get('name') or '').strip()
    teamSize     = (data.get('teamSize') or '').strip()
    logo         = (data.get('logo') or '').strip()

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    users = load_users()
    if email in users and users[email].get("status") == "active":
        return jsonify({'error': 'User already exists'}), 409

    # Store a pending profile (not allowed to login yet)
    users[email] = {
        'password':                password,
        'businessType':            businessType,
        'business':                businessName,
        'name':                    name,
        'teamSize':                teamSize,
        'picture':                 logo,
        'status':                  'pending_payment',
        'trial_start':             _now_iso(),
        'trial_ending_notice_sent': False,
        'stripe_connected':        False,
    }
    save_users(users)

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            mode='subscription',
            line_items=[{'price': STRIPE_PRICE_ID, 'quantity': 1}],
            customer_email=email,
            subscription_data={'trial_period_days': 14, 'metadata': {'user_email': email}},
            success_url=f"{FRONTEND_URL}/login?paid=1",
            cancel_url=f"{FRONTEND_URL}/login?canceled=1",
        )
        return jsonify({'checkoutUrl': session.url}), 200
    except Exception as e:
        app.logger.error("[STRIPE CHECKOUT ERROR] %s", e)
        return jsonify({'error': 'Could not start payment process.'}), 500

@app.route('/api/login', methods=['POST'])
def login():
    data     = request.get_json(force=True, silent=True) or {}
    email    = _email_key(data.get('email') or '')
    password = (data.get('password') or '').strip()
    users    = load_users()
    user     = users.get(email)
    if not user:
        return jsonify({'error': 'Invalid credentials or account not active'}), 401
    if user.get('password') != password or user.get('status') != 'active':
        return jsonify({'error': 'Invalid credentials or account not active'}), 401
    return jsonify({
        'message': 'Login successful',
        'user': {
            'email':             email,
            'name':              user.get('name', ''),
            'logo':              user.get('picture', ''),
            'businessType':      user.get('businessType', ''),
            'business':          user.get('business', ''),
            'people':            user.get('people', ''),
            'location':          user.get('location', ''),
            'stripe_account_id': user.get('stripe_account_id'),
            'stripe_connected':  user.get('stripe_connected', False),
        }
    }), 200

# ---- Stripe Connect & Invoices ---------------------------------------------
@app.route("/api/stripe/connect-url", methods=["GET"])
def get_stripe_connect_url():
    if not stripe:
        return jsonify({"error": "Stripe not configured"}), 503
    user_email = _email_key(request.args.get("user_email") or "")
    if not user_email:
        return jsonify({"error": "Missing user_email"}), 400
    acct = stripe.Account.create(type="express", email=user_email)
    users = load_users()
    users.setdefault(user_email, {})
    users[user_email]["stripe_account_id"] = acct.id
    users[user_email]["stripe_connected"]  = True
    save_users(users)
    return_url  = f"{FRONTEND_URL}/app?stripe_connected=1"
    refresh_url = f"{FRONTEND_URL}/app?stripe_refresh=1"
    link = stripe.AccountLink.create(
        account=acct.id, refresh_url=refresh_url, return_url=return_url, type="account_onboarding"
    )
    return jsonify({"url": link.url}), 200

@app.route("/api/stripe/oauth/connect", methods=["GET"])
def stripe_oauth_connect():
    user_email = _email_key(request.args.get("user_email") or "")
    if not user_email:
        return jsonify({"error": "Missing user_email"}), 400
    params = {
        "response_type": "code",
        "client_id": STRIPE_CONNECT_CLIENT_ID,
        "scope": "read_write",
        "redirect_uri": STRIPE_REDIRECT_URI or "",
        "state": user_email,
    }
    return jsonify({"url": "https://connect.stripe.com/oauth/authorize?" + urlencode(params)}), 200

@app.route("/api/stripe/dashboard-link", methods=["GET"])
def stripe_dashboard_link():
    if not stripe:
        return jsonify({"error": "Stripe not configured"}), 503
    user_email = _email_key(request.args.get("user_email") or "")
    if not user_email:
        return jsonify({"error": "Missing user_email"}), 400
    users = load_users()
    acct_id = (users.get(user_email, {}) or {}).get("stripe_account_id")
    if not acct_id:
        return jsonify({"error": "Stripe account not connected"}), 400
    acct = stripe.Account.retrieve(acct_id)
    if acct.type in ("express", "custom"):
        link = stripe.Account.create_login_link(acct_id)
        return jsonify({"url": link.url}), 200
    return jsonify({"url": f"https://dashboard.stripe.com/{acct_id}"}), 200

@app.route("/api/stripe/oauth/callback", methods=["GET"])
def stripe_oauth_callback():
    if not stripe:
        return "Stripe not configured", 503
    error      = request.args.get("error")
    error_desc = request.args.get("error_description", "")
    user_email = _email_key(request.args.get("state") or "")
    if error:
        msg = quote(error_desc)
        return redirect(f"{FRONTEND_URL}/app?stripe_error=1&stripe_error_desc={msg}")
    code = request.args.get("code")
    if not code or not user_email:
        return redirect(f"{FRONTEND_URL}/app?stripe_error=1&stripe_error_desc=missing_code_or_state")
    resp = stripe.OAuth.token(grant_type="authorization_code", code=code)
    stripe_user_id = resp["stripe_user_id"]
    users = load_users()
    users.setdefault(user_email, {})
    users[user_email]["stripe_account_id"] = stripe_user_id
    users[user_email]["stripe_connected"]  = True
    save_users(users)
    return redirect(f"{FRONTEND_URL}/app?stripe_connected=1")

@app.route("/api/stripe/account", methods=["GET"])
def get_stripe_account():
    if not stripe:
        return jsonify({"error": "Stripe not configured"}), 503
    user_email = _email_key(request.args.get("user_email") or "")
    if not user_email:
        return jsonify({"error": "Missing user_email"}), 400
    acct_id = get_connected_acct(user_email)
    if not acct_id:
        return jsonify({"error": "Stripe account not connected"}), 404
    acct = stripe.Account.retrieve(acct_id)
    return jsonify({"account": {
        "id": acct.id,
        "default_currency": acct.default_currency,
        "details_submitted": acct.details_submitted,
        "email": acct.email,
    }}), 200

def serialize_invoice(inv):
    currency = inv.currency
    total_attr = getattr(inv, "total", None) or inv.amount_due
    amount_total = from_minor(total_attr, currency)
    amount_due   = from_minor(inv.amount_due, currency)
    amount_paid  = from_minor(getattr(inv, "amount_paid", 0), currency)
    display      = amount_total if inv.status == "paid" else amount_due
    cust_name = None
    try:
        cust_name = inv.customer.name  # type: ignore
    except Exception:
        pass
    cust_name = cust_name or inv.metadata.get("customer_name") or inv.customer_email
    return {
        "id": inv.id,
        "customer_name": cust_name,
        "customer_email": inv.customer_email,
        "amount_total": round(amount_total, 2),
        "amount_due": round(amount_due, 2),
        "amount_paid": round(amount_paid, 2),
        "amount_display": round(display, 2),
        "currency": currency,
        "due_date": inv.due_date,
        "status": inv.status,
        "invoice_url": inv.hosted_invoice_url,
        "number": getattr(inv, "number", None),
    }

@app.route('/api/stripe/invoice', methods=['POST'])
def create_stripe_invoice():
    if not stripe:
        return jsonify({"error": "Stripe not configured"}), 503
    data = request.get_json(force=True, silent=True) or {}
    user_email     = _email_key(data.get("user_email") or "")
    customer_name  = (data.get("customer_name") or "").strip()
    customer_email = _email_key(data.get("customer_email") or "")
    amount         = data.get("amount")
    description    = (data.get("description") or "").strip()
    currency       = (data.get("currency") or "").lower().strip() or None

    if not all([user_email, customer_name, customer_email, description, amount]):
        return jsonify({"error": "Missing required fields"}), 400
    try:
        total_float = float(amount)
        assert total_float > 0
    except Exception:
        return jsonify({"error": "Amount must be a number > 0"}), 400

    acct_id = get_connected_acct(user_email)
    if not acct_id:
        return jsonify({"error": "Stripe account not connected"}), 400

    try:
        if not currency:
            acct = stripe.Account.retrieve(acct_id)
            currency = (acct.default_currency or "usd").lower()

        existing = stripe.Customer.list(email=customer_email, limit=1, stripe_account=acct_id).data
        if existing:
            cust = existing[0]
            stripe.Customer.modify(cust.id, name=customer_name, stripe_account=acct_id)
        else:
            cust = stripe.Customer.create(email=customer_email, name=customer_name, stripe_account=acct_id)
        cust_id = cust.id

        inv = stripe.Invoice.create(
            customer=cust_id, collection_method="send_invoice", days_until_due=7,
            auto_advance=False, metadata={"user_email": user_email, "customer_name": customer_name},
            stripe_account=acct_id,
        )

        total_minor = to_minor(total_float, currency)
        stripe.InvoiceItem.create(
            customer=cust_id, invoice=inv.id, amount=total_minor, currency=currency,
            description=description, metadata={"user_email": user_email, "customer_name": customer_name},
            stripe_account=acct_id,
        )

        inv = stripe.Invoice.finalize_invoice(inv.id, stripe_account=acct_id)

        latest = stripe.Invoice.list(limit=100, expand=["data.customer"], stripe_account=acct_id).data
        invoices = [serialize_invoice(x) for x in latest]

        return jsonify({
            "success": True,
            "invoice_id": inv.id,
            "invoice_url": inv.hosted_invoice_url,
            "amount_due":   from_minor(inv.amount_due, inv.currency),
            "amount_total": from_minor(getattr(inv, "total", None) or inv.amount_due, inv.currency),
            "currency": inv.currency,
            "invoice": serialize_invoice(inv),
            "invoices": invoices,
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/stripe/invoices', methods=['GET'])
def list_stripe_invoices():
    if not stripe:
        return jsonify({"error": "Stripe not configured"}), 503
    user_email = _email_key(request.args.get("user_email") or "")
    if not user_email:
        return jsonify({"error": "Missing user_email"}), 400
    acct_id = get_connected_acct(user_email)
    if not acct_id:
        return jsonify({"error": "Stripe account not connected"}), 400
    invs = stripe.Invoice.list(limit=100, expand=["data.customer"], stripe_account=acct_id).data
    out = [serialize_invoice(inv) for inv in invs]
    return jsonify({"invoices": out}), 200

@app.route('/api/stripe/invoice/send', methods=['POST'])
def resend_invoice_email():
    if not stripe or not SENDGRID_API_KEY or not SendGridAPIClient:
        return jsonify({"error": "Email or Stripe not configured"}), 503
    data = request.get_json(force=True, silent=True) or {}
    invoice_id = data.get("invoice_id")
    user_email = _email_key(data.get("user_email") or "")
    if not invoice_id or not user_email:
        return jsonify({"error": "Missing invoice_id or user_email"}), 400
    users = load_users()
    user = users.get(user_email)
    if not user:
        return jsonify({"error": "User not found"}), 404
    acct_id = user.get("stripe_account_id")
    if not acct_id:
        return jsonify({"error": "Stripe account not connected"}), 400
    user_name = user.get("name", "")
    business  = user.get("business", "")
    try:
        inv = stripe.Invoice.retrieve(invoice_id, expand=["customer"], stripe_account=acct_id)
        total = from_minor(getattr(inv, "total", None) or inv.amount_due, inv.currency)
        cust = inv.customer
        html = f"""
          <p>Hi {inv.metadata.get('customer_name','')},</p>
          <p>Your invoice <strong>#{getattr(inv,'number','')}</strong> from <strong>{business}</strong> is now available.</p>
          <p><strong>Amount:</strong> {total:.2f} {inv.currency.upper()}</p>
          <p><a href="{inv.hosted_invoice_url}">View &amp; pay your invoice →</a></p>
          <br/>
          <p>Thanks for working with {business}!</p>
        """
        msg = Mail(
            from_email=Email("billing@retainai.ca", name=f"{user_name} at {business}"),
            to_emails=cust.email,
            subject=f"Invoice #{getattr(inv,'number','')} from {business}",
            html_content=html,
        )
        SendGridAPIClient(SENDGRID_API_KEY).send(msg)
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/stripe/webhook', methods=['POST'])
def stripe_webhook():
    if not stripe or not STRIPE_WEBHOOK_SECRET:
        return '', 200  # ignore silently if not configured
    payload = request.data
    sig_header = request.headers.get('stripe-signature')
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        app.logger.warning("[STRIPE WEBHOOK VERIFY FAIL] %s", e)
        return '', 400

    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        email = (session.get('customer_email') or "").lower()
        if not email:
            # try expand customer
            try:
                cust_id = session.get("customer")
                if cust_id:
                    cust = stripe.Customer.retrieve(cust_id)
                    email = (cust.get("email") or "").lower()
            except Exception:
                pass
        if email:
            users = load_users()
            user = users.get(email, {
                'password': None, 'status': 'pending_payment',
                'name': '', 'businessType': '', 'business': ''
            })
            user['status'] = 'active'
            user.setdefault('trial_start', _now_iso())
            users[email] = user
            save_users(users)
            try:
                send_welcome_email(email, user.get('name'), user.get('businessType'))
            except Exception:
                pass

    return '', 200

# =============================================================================
# Google OAuth + Calendar (optional; safe if libs missing)
# =============================================================================
try:
    from google.oauth2 import id_token
    from google.auth.transport import requests as grequests
except Exception:
    id_token = None
    grequests = None

GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar",
]

@app.route('/api/oauth/google', methods=['POST'])
def google_oauth():
    if not id_token or not grequests or not GOOGLE_CLIENT_ID:
        return jsonify({'error': 'Google not available'}), 501
    data = request.get_json(force=True, silent=True) or {}
    token = data.get('credential')
    if not token:
        return jsonify({'error': 'No Google token provided'}), 400
    try:
        idinfo = id_token.verify_oauth2_token(token, grequests.Request(), GOOGLE_CLIENT_ID)
        email   = _email_key(idinfo['email'])
        name    = idinfo.get('name', '') or ''
        picture = idinfo.get('picture', '') or ''
        users = load_users()
        user  = users.get(email)
        if not user:
            users[email] = {
                'password': None, 'businessType': '', 'business': '',
                'name': name, 'picture': picture, 'people': '',
                'trial_start': _now_iso(), 'status': 'pending_payment',
                'trial_ending_notice_sent': False
            }
        else:
            if not user.get('name') and name:
                user['name'] = name
            if not user.get('picture') and picture:
                user['picture'] = picture
            users[email] = user
        save_users(users)
        return jsonify({
            'message': 'Google login successful',
            'user': {
                'email':             email,
                'name':              users[email].get('name', name),
                'logo':              users[email].get('picture', picture),
                'businessType':      users[email].get('businessType',''),
                'business':          users[email].get('business',''),
                'people':            users[email].get('people',''),
                'stripe_account_id': users[email].get('stripe_account_id'),
                'stripe_connected':  users[email].get('stripe_connected', False),
            }
        }), 200
    except Exception as e:
        app.logger.error("[GOOGLE OAUTH ERROR] %s", e)
        return jsonify({'error': 'Invalid Google token'}), 401

@app.route('/api/oauth/google/complete', methods=['POST'])
def google_oauth_complete():
    data         = request.get_json(force=True, silent=True) or {}
    email        = _email_key(data.get('email') or '')
    businessType = data.get('businessType','')
    businessName = data.get('businessName', businessType)
    name         = data.get('name','')
    logo         = data.get('logo','')
    people       = data.get('people','')
    users = load_users()
    if not email or email not in users:
        return jsonify({'error': 'User not found'}), 404
    rec = users[email]
    rec.update({
        'businessType': businessType,
        'business':     businessName,
        'name':         name,
        'picture':      logo,
        'people':       people
    })
    users[email] = rec
    save_users(users)
    return jsonify({
        'message': 'Profile updated',
        'user': {
            'email':             email,
            'name':              name,
            'logo':              logo,
            'businessType':      businessType,
            'business':          businessName,
            'people':            people,
            'stripe_account_id': rec.get('stripe_account_id'),
            'stripe_connected':  rec.get('stripe_connected', False)
        }
    }), 200

@app.get("/api/google/auth-url")
def google_auth_url():
    email = _email_key(request.args.get("user_email") or "")
    if not (GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI):
        return jsonify({"error": "Google not configured"}), 501
    if not email:
        return jsonify({"error": "Missing user_email"}), 400
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "access_type": "offline",
        "prompt": "consent",
        "scope": " ".join(GOOGLE_SCOPES),
        "state": email,
    }
    return jsonify({"url": "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)})

@app.get("/api/google/oauth-callback")
def google_oauth_cb():
    code  = request.args.get("code")
    error = request.args.get("error")
    state = _email_key(request.args.get("state") or "")
    if error:
        return f"Google OAuth error: {error}", 400
    if not code or not state or not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET or not GOOGLE_REDIRECT_URI:
        return "Missing code/state or Google config", 400
    token_resp = pyrequests.post("https://oauth2.googleapis.com/token", data={
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    })
    tokens = token_resp.json()
    access_token  = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    if not access_token or not refresh_token:
        return "Failed to obtain tokens", 400
    cal_resp = pyrequests.get(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    calendars = cal_resp.json().get("items", []) if cal_resp.ok else []
    users = load_users()
    user = users.get(state, {})
    user["gcal_connected"] = True
    user["gcal_access_token"] = access_token
    user["gcal_refresh_token"] = refresh_token
    user["gcal_calendars"] = [{"id": c["id"], "summary": c.get("summary"), "primary": c.get("primary", False)} for c in calendars]
    users[state] = user
    save_users(users)
    return "Google Calendar connected! You may close this tab and return to the app."

@app.get("/api/google/status/<path:email>")
def google_status(email):
    users = load_users()
    user = users.get(_email_key(email))
    if not user or not user.get("gcal_connected"):
        return jsonify({"connected": False})
    return jsonify({"connected": True, "calendars": user.get("gcal_calendars", [])})

@app.post("/api/google/disconnect/<path:email>")
def google_disconnect(email):
    users = load_users()
    k = _email_key(email)
    user = users.get(k)
    if user:
        user.pop("gcal_access_token", None)
        user.pop("gcal_refresh_token", None)
        user["gcal_connected"] = False
        user.pop("gcal_calendars", None)
        users[k] = user
        save_users(users)
        return jsonify({"disconnected": True})
    return jsonify({"disconnected": False})

@app.get("/api/google/calendars/<path:email>")
def google_calendars(email):
    users = load_users()
    user = users.get(_email_key(email))
    if not user or not user.get("gcal_access_token"):
        return jsonify({"error": "Not connected"}), 401
    access_token = user["gcal_access_token"]
    resp = pyrequests.get(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    if not resp.ok:
        return jsonify({"error": resp.text}), 500
    items = resp.json().get("items", [])
    out = [{"id": c["id"], "summary": c.get("summary"), "primary": c.get("primary", False)} for c in items]
    return jsonify({"calendars": out})

@app.get("/api/google/events/<path:email>")
def google_events(email):
    calendar_id = request.args.get("calendarId")
    users = load_users()
    user = users.get(_email_key(email))
    if not user or not user.get("gcal_access_token"):
        return jsonify({"error": "Not connected"}), 401
    access_token = user.get("gcal_access_token")
    if not calendar_id:
        cals = user.get("gcal_calendars", [])
        calendar_id = "primary"
        for c in cals:
            if c.get("primary"):
                calendar_id = c["id"]
                break
    now = datetime.datetime.utcnow().isoformat() + "Z"
    max_time = (datetime.datetime.utcnow() + datetime.timedelta(days=30)).isoformat() + "Z"
    url = (
        f"https://www.googleapis.com/calendar/v3/calendars/"
        f"{quote(calendar_id)}/events"
        f"?timeMin={now}&timeMax={max_time}&singleEvents=true&orderBy=startTime"
    )
    resp = pyrequests.get(url, headers={"Authorization": f"Bearer {access_token}"})
    if not resp.ok:
        return jsonify({"error": resp.text}), 500
    return jsonify(resp.json())
# =============================================================================
# WhatsApp Cloud API  (24h window, templates, webhook, statuses, threads)
# =============================================================================

# Caches
_MSG_CACHE: Dict[tuple, Dict[str, Any]] = {}
_MSG_CACHE_TTL_SECONDS = 2
_WABA_RES = {"id": None, "checked_at": None}
_WABA_TTL_SECONDS = 300

def _norm_wa(num: str) -> str:
    d = re.sub(r"\D", "", num or "")
    if len(d) == 10 and DEFAULT_COUNTRY_CODE.isdigit():
        d = DEFAULT_COUNTRY_CODE + d
    return d

def _wa_env():
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_ID:
        raise RuntimeError("WhatsApp credentials missing")
    return WHATSAPP_TOKEN, WHATSAPP_PHONE_ID

def wa_normalize_lang(code: str) -> str:
    c = str(code or "").replace("-", "_").strip()
    if not c:
        return (WHATSAPP_TEMPLATE_LANG or "en_US")
    parts = c.split("_")
    if len(parts) == 1:
        return parts[0].lower()
    if len(parts) >= 2 and parts[0] and parts[1]:
        return parts[0].lower() + "_" + parts[1].upper()
    return c.lower()

def wa_primary_lang(code: str) -> str:
    return (code or "").replace("-", "_").split("_", 1)[0].lower() if code else ""

def _lead_matches_wa(lead, wa_digits):
    for key in ("whatsapp", "phone"):
        if _norm_wa(lead.get(key)) == wa_digits:
            return True
    return False

def find_user_by_whatsapp(wa_id):
    wa = _norm_wa(wa_id or "")
    leads_by_user = load_leads()
    for user_email, leads in (leads_by_user or {}).items():
        for lead in leads:
            if _lead_matches_wa(lead, wa):
                return user_email
    return None

def find_lead_by_whatsapp(wa_id):
    wa = _norm_wa(wa_id or "")
    leads_by_user = load_leads()
    for _, leads in (leads_by_user or {}).items():
        for lead in leads:
            if _lead_matches_wa(lead, wa):
                return lead.get("id")
    return None

def get_last_inbound_ts(user_email: str, lead_id: str):
    chats = load_chats()
    msgs = (chats.get(user_email, {}) or {}).get(lead_id, []) or []
    for m in reversed(msgs):
        if m.get("from") == "lead":
            return m.get("time")
    return None

def within_24h(user_email: str, lead_id: str) -> bool:
    ts = get_last_inbound_ts(user_email, lead_id)
    if not ts:
        return False
    try:
        last_dt = dt.fromisoformat(ts.replace("Z", ""))
    except Exception:
        return False
    return (dt.utcnow() - last_dt) <= timedelta(hours=24)

def _verify_meta_signature(raw_body: bytes, header_sig: str) -> bool:
    secret = META_APP_SECRET
    if not secret or not header_sig:
        return True
    try:
        if not header_sig.startswith("sha256="):
            return False
        sent = header_sig.split("=", 1)[1]
        mac = hmac.new(secret.encode("utf-8"), msg=raw_body, digestmod=hashlib.sha256)
        return hmac.compare_digest(mac.hexdigest(), sent)
    except Exception:
        return False

def _resolve_waba_id(force: bool = False) -> str:
    now = dt.utcnow()
    if not force and _WABA_RES["id"] and _WABA_RES["checked_at"] and (now - _WABA_RES["checked_at"]).total_seconds() < _WABA_TTL_SECONDS:
        return _WABA_RES["id"]  # type: ignore
    try:
        token, phone_id = _wa_env()
        url = f"https://graph.facebook.com/v20.0/{phone_id}"
        headers = {"Authorization": f"Bearer {token}"}
        params = {"fields": "whatsapp_business_account{id},display_phone_number"}
        r = pyrequests.get(url, headers=headers, params=params, timeout=30)
        wid = None
        if r.ok:
            wid = (((r.json() or {}).get("whatsapp_business_account") or {}).get("id"))
        if not wid:
            wid = WHATSAPP_WABA_ID or ""
        _WABA_RES["id"] = wid
        _WABA_RES["checked_at"] = now
        app.logger.info("[WA WABA] resolved WABA id=%s", wid)
        return wid
    except Exception as e:
        app.logger.warning("[WA WABA] resolve error: %s", e)
        return WHATSAPP_WABA_ID or ""

def _fetch_templates_for_waba(waba_id: str):
    headers = {"Authorization": f"Bearer {WHATSAPP_TOKEN}"}
    params = {"fields": "name,language,status,category,components", "limit": 200}
    url = f"https://graph.facebook.com/v20.0/{waba_id}/message_templates"
    return pyrequests.get(url, headers=headers, params=params, timeout=30)

def send_wa_text(to_number: str, body: str):
    token, phone_id = _wa_env()
    url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{phone_id}/messages"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"messaging_product": "whatsapp", "to": _norm_wa(to_number), "type": "text", "text": {"body": body}}
    resp = pyrequests.post(url, headers=headers, json=payload, timeout=30)
    if resp.status_code >= 400:
        app.logger.error("[WA SEND ERROR] %s %s", resp.status_code, resp.text)
    return resp

def send_wa_template(to_number: str, template_name: str, lang_code: str, parameters: Optional[List[str]] = None):
    token, phone_id = _wa_env()
    url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{phone_id}/messages"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    comps = []
    if parameters is not None:
        comps = [{"type": "body", "parameters": [{"type": "text", "text": str(p)} for p in parameters]}]
    payload = {
        "messaging_product": "whatsapp",
        "to": _norm_wa(to_number),
        "type": "template",
        "template": {"name": template_name, "language": {"code": wa_normalize_lang(lang_code)}, "components": comps}
    }
    resp = pyrequests.post(url, headers=headers, json=payload, timeout=30)
    if resp.status_code >= 400:
        app.logger.error("[WA TEMPLATE ERROR] %s %s", resp.status_code, resp.text)
    return resp

def _get_thread_cached(user_email, lead_id):
    key = (str(user_email or ""), str(lead_id or ""))
    now = dt.utcnow()
    cached = _MSG_CACHE.get(key)
    if cached and (now - cached["at"]).total_seconds() < _MSG_CACHE_TTL_SECONDS:
        return cached["data"], True
    chats = load_chats()
    msgs = (chats.get(user_email, {}) or {}).get(lead_id, []) or []
    _MSG_CACHE[key] = {"at": now, "data": msgs}
    return msgs, False

@app.get("/api/whatsapp/health")
def whatsapp_health():
    return jsonify({
        "ok": True,
        "has_token": bool(WHATSAPP_TOKEN),
        "has_phone_id": bool(WHATSAPP_PHONE_ID),
        "has_waba_id": bool(WHATSAPP_WABA_ID),
        "default_template": WHATSAPP_TEMPLATE_DEFAULT,
        "default_lang_ui": wa_primary_lang(WHATSAPP_TEMPLATE_LANG) or "en",
        "default_lang_api": wa_normalize_lang(WHATSAPP_TEMPLATE_LANG),
    }), 200

@app.get("/api/whatsapp/templates")
def list_templates():
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_ID:
        return jsonify({"error": "Missing token or phone id"}), 400
    waba_id = _resolve_waba_id()
    r = _fetch_templates_for_waba(waba_id)
    try:
        data = r.json()
        for t in data.get("data", []):
            t["normalized_language"] = wa_normalize_lang(t.get("language",""))
    except Exception:
        data = {"raw": r.text}
    return jsonify({"status": r.status_code, "waba_id": waba_id, "data": data}), r.status_code

@app.get("/api/whatsapp/template-info")
def template_info():
    name = (request.args.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    waba_id = _resolve_waba_id()
    r = _fetch_templates_for_waba(waba_id)
    if not r.ok:
        try: body = r.json()
        except Exception: body = {"raw": r.text}
        return jsonify({"error": "graph_list_failed", "status": r.status_code, "resp": body}), r.status_code
    items = (r.json() or {}).get("data", [])
    out = []
    for t in items:
        if (t.get("name") or "") != name: 
            continue
        comps = t.get("components") or []
        body = next((c for c in comps if (c.get("type") or "").upper() == "BODY"), {})
        params_list = body.get("parameters") or body.get("example", {}).get("body_text") or []
        if isinstance(params_list, list):
            if params_list and isinstance(params_list[0], list):
                body_param_count = max((len(x) for x in params_list), default=0)
            else:
                body_param_count = len(params_list)
        else:
            body_param_count = 0
        out.append({
            "name": t.get("name"),
            "language": wa_normalize_lang(t.get("language") or ""),
            "status": (t.get("status") or "").upper(),
            "body_param_count": body_param_count,
            "components": comps
        })
    if not out:
        return jsonify({"error": "template_not_found_on_phone_waba", "name": name, "waba_id": waba_id}), 404
    return jsonify({"waba_id": waba_id, "templates": out}), 200

@app.get("/api/whatsapp/template-state")
def template_state():
    name = (request.args.get("name") or WHATSAPP_TEMPLATE_DEFAULT or "").strip()
    lang = request.args.get("language_code") or WHATSAPP_TEMPLATE_LANG or "en"
    waba_id = _resolve_waba_id()
    r = _fetch_templates_for_waba(waba_id)
    items = (r.json() or {}).get("data", []) if r.ok else []
    req = wa_normalize_lang(lang)
    pri = wa_primary_lang(req)
    status = None
    fallback = None
    for t in items:
        if (t.get("name") or "") != name: 
            continue
        ln = wa_normalize_lang(t.get("language") or "")
        st = (t.get("status") or "").upper()
        if ln == req:
            status = st
        if wa_primary_lang(ln) == pri and (fallback or "").upper() != "APPROVED":
            fallback = st
    st = (status or fallback or "PENDING").upper()
    return jsonify({
        "name": name,
        "language": req,
        "status": st,
        "approved": st == "APPROVED",
        "checked_at": dt.utcnow().isoformat() + "Z"
    }), 200

@app.get("/api/whatsapp/window-state")
def whatsapp_window_state():
    user_email = _email_key(request.args.get("user_email") or "")
    lead_id    = (request.args.get("lead_id") or "")
    template_name = (request.args.get("template_name") or WHATSAPP_TEMPLATE_DEFAULT or "").strip()
    lang_code     = request.args.get("language_code") or WHATSAPP_TEMPLATE_LANG or ""
    inside = within_24h(user_email, lead_id)
    waba_id = _resolve_waba_id()
    r = _fetch_templates_for_waba(waba_id)
    items = (r.json() or {}).get("data", []) if r.ok else []
    status = "APPROVED" if inside else "PENDING"
    if not inside:
        for t in items:
            if (t.get("name") or "") == template_name and wa_normalize_lang(t.get("language")) == wa_normalize_lang(lang_code):
                status = (t.get("status") or "PENDING").upper()
                break
    return jsonify({
        "inside24h": inside,
        "templateApproved": inside or (status == "APPROVED"),
        "templateStatus": status,
        "templateName": template_name,
        "language": wa_normalize_lang(lang_code),
        "canFreeText": inside,
        "canTemplate": (not inside) and (status == "APPROVED")
    }), 200

@app.get('/api/whatsapp/messages')
def get_whatsapp_messages():
    user_email = _email_key(request.args.get("user_email") or "")
    lead_id = request.args.get("lead_id")
    msgs, _ = _get_thread_cached(user_email, lead_id)
    return jsonify({"messages": msgs}), 200

@app.get("/api/whatsapp/status")
def get_message_status():
    mid = request.args.get("message_id")
    if not mid:
        return jsonify({"error": "message_id is required"}), 400
    statuses = load_statuses()
    return jsonify(statuses.get(mid) or {}), 200

@app.post("/api/whatsapp/optout")
def set_optout():
    data = request.get_json(force=True) or {}
    user_email = _email_key(data.get("user_email") or "")
    lead_id = str(data.get("lead_id") or "")
    opt_out = bool(data.get("opt_out", True))
    if not user_email or not lead_id:
        return jsonify({"error": "user_email and lead_id required"}), 400
    leads = load_leads()
    arr = leads.get(user_email, []) or []
    for ld in arr:
        if str(ld.get("id")) == lead_id:
            ld["wa_opt_out"] = bool(opt_out)
    leads[user_email] = arr
    save_leads(leads)
    return jsonify({"ok": True, "opt_out": opt_out}), 200

@app.post('/api/whatsapp/send')
def send_whatsapp_message():
    """
    Inside 24h → send free text EXACTLY as typed.
    Outside 24h → require approved template on the sender phone’s WABA.
    Fallback locale selection: exact → same primary → any approved. Else 409 with availableLanguages.
    """
    try:
        data = request.get_json(force=True) or {}
    except Exception:
        data = {}

    def clean(v): 
        try: return str(v).strip() if v is not None else ""
        except Exception: return ""

    to_number       = clean(data.get("to") or data.get("phone"))
    raw_msg         = clean(data.get("message") or data.get("text"))
    user_email      = _email_key(clean(data.get("user_email")))
    lead_id         = clean(data.get("lead_id"))
    template_name   = clean(data.get("template_name") or WHATSAPP_TEMPLATE_DEFAULT)
    language_code   = clean(data.get("language_code") or WHATSAPP_TEMPLATE_LANG)

    # params (optional)
    raw_params = data.get("template_params")
    if isinstance(raw_params, str):
        raw_params = [p.strip() for p in raw_params.split(",") if p.strip()]
    elif not isinstance(raw_params, list):
        raw_params = None
    params = raw_params if raw_params and len(raw_params) > 0 else None

    if not to_number:
        return jsonify({"ok": False, "error": "Recipient 'to' is required"}), 400

    # Opt-out
    if user_email and lead_id:
        for ld in load_leads().get(user_email, []) or []:
            if str(ld.get("id")) == str(lead_id) and bool(ld.get("wa_opt_out")):
                return jsonify({"ok": False, "error": "Lead has opted out of WhatsApp messages"}), 403

    inside24 = within_24h(user_email, lead_id)
    requested = wa_normalize_lang(language_code)
    primary   = wa_primary_lang(requested)
    to_number = _norm_wa(to_number)

    waba_id = _resolve_waba_id()
    app.logger.info("[WA SEND] to=%s tpl=%s requested=%s inside24h=%s waba=%s",
                    to_number, template_name, requested, inside24, waba_id)

    try:
        if inside24:
            if not raw_msg:
                return jsonify({"ok": False, "error": "Message text required inside 24h"}), 400
            resp = send_wa_text(to_number, raw_msg)
            mode = "free_text"; sent_text = raw_msg; used_lang = None; locales = []
        else:
            if not template_name:
                return jsonify({"ok": False, "error": "Template name is required outside 24h.", "code": "TEMPLATE_REQUIRED_OUTSIDE_24H"}), 422

            r_list = _fetch_templates_for_waba(waba_id)
            if not getattr(r_list, "ok", False):
                try: body = r_list.json()
                except Exception: body = {"raw": r_list.text}
                app.logger.error("[WA SEND] list_templates failed %s %s", getattr(r_list, "status_code", None), body)
                return jsonify({
                    "ok": False,
                    "error": "Failed to fetch templates from Graph.",
                    "code": "GRAPH_LIST_TEMPLATES_FAILED",
                    "status": getattr(r_list, "status_code", None),
                    "resp": body
                }), 502

            items = (r_list.json() or {}).get("data", [])

            locales = []
            for t in items:
                if (t.get("name") or "") == template_name:
                    ln = wa_normalize_lang(t.get("language") or "")
                    st = (t.get("status") or "").upper()
                    locales.append({"language": ln, "status": st})

            if not locales:
                return jsonify({
                    "ok": False,
                    "error": f"Template '{template_name}' does not exist on this WABA.",
                    "code": "TEMPLATE_NAME_NOT_FOUND_ON_WABA",
                    "template": template_name,
                    "waba_id": waba_id
                }), 404

            exact = next((x for x in locales if x["language"] == requested), None)
            approved_any = [x for x in locales if x["status"] == "APPROVED"]
            approved_same_primary = [x for x in approved_any if wa_primary_lang(x["language"]) == primary]

            used_lang = requested
            fallback_reason = None
            if exact and exact["status"] == "APPROVED":
                pass
            elif approved_same_primary:
                used_lang = approved_same_primary[0]["language"]
                fallback_reason = "requested_locale_unapproved_same_primary_used"
            elif approved_any:
                used_lang = approved_any[0]["language"]
                fallback_reason = "requested_locale_unapproved_any_approved_used"
            else:
                return jsonify({
                    "ok": False,
                    "error": "Template is not approved in any locale; cannot send outside 24h window.",
                    "code": "TEMPLATE_NOT_APPROVED_ANY_LOCALE",
                    "template": template_name,
                    "waba_id": waba_id,
                    "requestedLanguage": requested,
                    "availableLanguages": locales
                }), 409

            resp = send_wa_template(to_number, template_name, used_lang, params)
            mode = "template"; sent_text = f"[template:{template_name}/{used_lang}] {raw_msg or ''}"

        try: result = resp.json()
        except Exception: result = {"raw": resp.text}

        if resp.status_code >= 400:
            err = {}
            try: err = result.get("error", {})
            except Exception: pass
            app.logger.error("[WA SEND ERROR] status=%s error=%s", resp.status_code, resp.text)
            return jsonify({
                "ok": False,
                "mode": mode,
                "status": resp.status_code,
                "error": err.get("message") or "WhatsApp API error",
                "code": err.get("code") or "WA_ERROR",
                "details": (err.get("error_data") or {}),
                "waba_id": waba_id,
                "resp": result
            }), resp.status_code

        msg_id = None
        if isinstance(result, dict):
            arr = result.get("messages")
            if isinstance(arr, list) and arr:
                msg_id = arr[0].get("id")

        # persist thread + status
        try:
            chats = load_chats()
            user_chats = (chats.get(user_email, {}) or {})
            arr = (user_chats.get(lead_id, []) or [])
            arr.append({"from": "user", "text": sent_text, "time": _now_iso()})
            user_chats[lead_id] = arr; chats[user_email] = user_chats; save_chats(chats)
            if msg_id:
                statuses = load_statuses()
                statuses[msg_id] = {"status": "sent_request", "user_email": user_email, "lead_id": lead_id,
                                    "to": to_number, "mode": mode, "time": _now_iso()}
                save_statuses(statuses)
            _MSG_CACHE[(str(user_email or ""), str(lead_id or ""))] = {"at": dt.utcnow(), "data": arr}
        except Exception as e:
            app.logger.warning("[WHATSAPP] save message/status error: %s", e)

        out = {"ok": True, "mode": mode, "status": resp.status_code, "message_id": msg_id,
               "requestedLanguage": requested, "usedLanguage": (used_lang if not inside24 else None),
               "waba_id": waba_id,
               "fallbackUsed": (not inside24) and (used_lang is not None and used_lang != requested)}
        if mode == "template":
            out["availableLanguages"] = locales
            if out["fallbackUsed"]:
                out["fallbackReason"] = fallback_reason
        return jsonify(out), resp.status_code

    except RuntimeError as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    except pyrequests.RequestException as e:
        return jsonify({"ok": False, "error": f"Network error: {e}"}), 502

@app.get("/api/whatsapp/debug/template-locales")
def debug_template_locales():
    name = (request.args.get("name") or "").strip()
    r = _fetch_templates_for_waba(_resolve_waba_id())
    items = (r.json() or {}).get("data", []) if r.ok else []
    locales = [{"language": wa_normalize_lang(t.get("language") or ""), "status": (t.get("status") or "").upper()}
               for t in items if (t.get("name") or "") == name] if name else []
    return jsonify({
        "phone_id": WHATSAPP_PHONE_ID,
        "resolved_waba_id": _resolve_waba_id(),
        "template_name": name or None,
        "locales": locales,
        "raw_status": r.status_code if r is not None else None
    }), 200

# ---- Webhook: verification, delivery/read statuses, inbound messages, opt-out
@app.route("/api/whatsapp/webhook", methods=["GET", "POST"])
def whatsapp_webhook():
    if request.method == "GET":
        if request.args.get("hub.verify_token") == (WHATSAPP_VERIFY_TOKEN or ""):
            return request.args.get("hub.challenge") or "Verified", 200
        return "Invalid verification token", 403

    raw = request.get_data()
    header_sig = request.headers.get("X-Hub-Signature-256")
    if not _verify_meta_signature(raw, header_sig):
        return "Signature mismatch", 403

    payload = request.get_json(silent=True) or {}
    try:
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})

                # delivery/read statuses
                for status in value.get("statuses", []):
                    statuses = load_statuses()
                    statuses[status.get("id") or "unknown"] = {
                        "status": status.get("status"),
                        "timestamp": status.get("timestamp"),
                        "recipient": status.get("recipient_id"),
                        "errors": status.get("errors")
                    }
                    save_statuses(statuses)

                # inbound messages
                messages = value.get("messages", [])
                contacts = value.get("contacts", [])
                sender_waid = contacts[0].get("wa_id") if contacts else None

                for m in messages:
                    t = m.get("type")
                    if t == "text": text = m.get("text", {}).get("body", "")
                    elif t == "interactive": text = str(m.get("interactive"))
                    elif t == "button": text = str(m.get("button"))
                    else: text = f"[{t} message]"

                    # opt-out / opt-in
                    if sender_waid and isinstance(text, str):
                        up = text.strip().upper()
                        if up in ("STOP", "UNSUBSCRIBE", "STOP ALL", "CANCEL"):
                            wa = _norm_wa(sender_waid)
                            data = load_leads()
                            changed = False
                            for _, leads in (data or {}).items():
                                for ld in leads:
                                    if _lead_matches_wa(ld, wa):
                                        ld["wa_opt_out"] = True
                                        changed = True
                            if changed: save_leads(data)
                            try: send_wa_text(sender_waid, "You have been unsubscribed. Reply START to opt back in.")
                            except Exception: pass
                        elif up in ("START", "UNSTOP", "SUBSCRIBE"):
                            wa = _norm_wa(sender_waid)
                            data = load_leads()
                            changed = False
                            for _, leads in (data or {}).items():
                                for ld in leads:
                                    if _lead_matches_wa(ld, wa):
                                        ld["wa_opt_out"] = False
                                        changed = True
                            if changed: save_leads(data)
                            try: send_wa_text(sender_waid, "You are now opted back in. You can reply STOP anytime to opt out.")
                            except Exception: pass

                    # save inbound to proper thread
                    user_email = find_user_by_whatsapp(sender_waid) if sender_waid else None
                    lead_id = find_lead_by_whatsapp(sender_waid) if sender_waid else None
                    chats = load_chats()
                    user_chats = (chats.get(user_email, {}) or {})
                    arr = (user_chats.get(lead_id, []) or [])
                    arr.append({"from": "lead", "text": text, "time": _now_iso()})
                    user_chats[lead_id] = arr
                    chats[user_email] = user_chats
                    save_chats(chats)
                    _MSG_CACHE[(str(user_email or ""), str(lead_id or ""))] = {"at": dt.utcnow(), "data": arr}

    except Exception as e:
        app.logger.warning("[WHATSAPP WEBHOOK] parse error: %s", e)

    return "OK", 200


# =============================================================================
# Scheduler — safe bootstrap (no crashes on Render; runs only if enabled)
# =============================================================================
# If APScheduler import wasn't present earlier, try again here. Fall back to no-op.
if 'APScheduler' not in globals():
    try:
        from flask_apscheduler import APScheduler  # type: ignore
    except Exception:
        APScheduler = None  # type: ignore

scheduler = None

def _start_scheduler_once():
    """
    Safe start:
      - Only starts if env RUN_JOBS=1 (to avoid duplicate jobs across gunicorn workers).
      - Skips cleanly if APScheduler not installed.
    """
    global scheduler
    if os.getenv("RUN_JOBS", "0") != "1":
        app.logger.info("[SCHED] RUN_JOBS not set to 1 — scheduler disabled.")
        return
    if scheduler is not None:
        return
    if APScheduler is None:
        app.logger.info("[SCHED] APScheduler not available — skipping jobs.")
        return
    try:
        sch = APScheduler()
        sch.init_app(app)

        # Lead follow-up scan every day at 09:00 UTC
        sch.add_job(id="lead_followups", func=check_for_lead_reminders,
                    trigger="cron", hour=9, minute=0, replace_existing=True)

        # Birthday greetings + reminders daily at 08:00 UTC
        sch.add_job(id="birthday_greetings", func=send_birthday_greetings,
                    trigger="cron", hour=8, minute=0, replace_existing=True)

        # Trial ending notices at 10:00 UTC daily
        sch.add_job(id="trial_ending_notices", func=send_trial_ending_soon,
                    trigger="cron", hour=10, minute=0, replace_existing=True)

        sch.start()
        scheduler = sch
        app.logger.info("[SCHED] started with 3 jobs (UTC).")
    except Exception as e:
        app.logger.warning("[SCHED] failed to start: %s", e)

# Start scheduler (only if explicitly enabled)
_start_scheduler_once()


# =============================================================================
# End of app.py
# =============================================================================

if __name__ == "__main__":
    # Dev run
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=(os.getenv("FLASK_DEBUG","0")=="1"))
