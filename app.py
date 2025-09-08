# ==========================
# app.py  (Part 1 of 3)
# Core boot, CORS, storage, users, leads, appointments
# ==========================
import os, json, re, hmac, hashlib, base64, datetime, urllib.parse, time, threading, uuid, zlib, random
from uuid import uuid4
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse, unquote

from flask import Flask, request, jsonify, send_from_directory, redirect, Blueprint
from flask_cors import CORS

# Load .env locally only
if os.getenv("FLASK_ENV") != "production":
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except Exception:
        pass

import stripe
import requests                  # used throughout (AI, automations, Google)
import requests as pyrequests    # legacy usage kept for compatibility
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email
from flask_apscheduler import APScheduler
from google.oauth2 import id_token
from google.auth.transport import requests as grequests

print(f"[BOOT] RetainAI started (PID: {os.getpid()})")

# ---------------------------------------------------
# Flask app & CORS
# ---------------------------------------------------
class Config:
    SCHEDULER_API_ENABLED = True

app = Flask(__name__)
app.config.from_object(Config())

# Allowed origins (env overrides supported)
_raw_origins = (
    os.getenv("ALLOWED_ORIGINS")
    or os.getenv("FRONTEND_ORIGINS")
    or "http://localhost:3000,https://app.retainai.ca"
)
ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in _raw_origins.split(",") if o and o.strip()]

CORS(
    app,
    supports_credentials=True,
    resources={
        r"/api/*": {
            "origins": ALLOWED_ORIGINS,
            "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "X-User-Email"],
        }
    },
)

# Disable Flask-APScheduler HTTP API so it doesn’t add routes at runtime
app.config.setdefault("SCHEDULER_API_ENABLED", False)

@app.after_request
def add_cors_headers(resp):
    origin = (request.headers.get("Origin") or "").rstrip("/")
    if origin in ALLOWED_ORIGINS:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Vary"] = "Origin"
        resp.headers["Access-Control-Allow-Credentials"] = "true"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-User-Email"
        resp.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    else:
        resp.headers.pop("Access-Control-Allow-Origin", None)
    return resp

# Health
@app.get("/healthz")
def healthz(): return "ok", 200

@app.get("/api/health")
def api_health(): return {"status": "ok"}, 200

# ---------------------------------------------------
# Persistent storage root & layout
# ---------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()

# Prefer /var/data if present; else env or ./data
DATA_ROOT = (
    os.getenv("DATA_ROOT")
    or ("/var/data" if os.path.isdir("/var/data") else None)
    or os.path.join(BASE_DIR, "data")
)
os.makedirs(DATA_ROOT, exist_ok=True)
print(f"[BOOT] DATA_ROOT = {DATA_ROOT}")

# JSON/state files in DATA_ROOT
LEADS_FILE         = os.path.join(DATA_ROOT, "leads.json")
USERS_FILE         = os.path.join(DATA_ROOT, "users.json")
NOTIFICATIONS_FILE = os.path.join(DATA_ROOT, "notifications.json")
APPOINTMENTS_FILE  = os.path.join(DATA_ROOT, "appointments.json")
CHAT_FILE          = os.path.join(DATA_ROOT, "whatsapp_chats.json")
STATUS_FILE        = os.path.join(DATA_ROOT, "whatsapp_status.json")

# ICS files dir
ICS_DIR = os.path.join(DATA_ROOT, "ics_files")
os.makedirs(ICS_DIR, exist_ok=True)

# Automations engine files
FILE_AUTOMATIONS   = os.path.join(DATA_ROOT, "automations.json")
FILE_STATE         = os.path.join(DATA_ROOT, "automation_state.json")
FILE_NOTIFICATIONS = os.path.join(DATA_ROOT, "notifications_stream.json")
FILE_USERS         = os.path.join(DATA_ROOT, "users_profiles.json")

# In-memory subscriptions store (push)
SUBSCRIPTIONS: Dict[str, dict] = {}

# Channels
CHANNEL_EMAIL = "email"
CHANNEL_WHATSAPP = "whatsapp"

# ---------------------------------------------------
# Env & third-party keys
# ---------------------------------------------------
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
SENDGRID_API_KEY   = os.getenv("SENDGRID_API_KEY")
VAPID_PUBLIC_KEY   = os.getenv("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY  = os.getenv("VAPID_PRIVATE_KEY")   # not used to send email
SENDER_EMAIL       = os.getenv("SENDER_EMAIL", "noreply@retainai.ca")

STRIPE_SECRET_KEY        = os.getenv("STRIPE_SECRET_KEY")
STRIPE_PRICE_ID          = os.getenv("STRIPE_PRICE_ID")
STRIPE_WEBHOOK_SECRET    = os.getenv("STRIPE_WEBHOOK_SECRET")
STRIPE_CONNECT_CLIENT_ID = os.getenv("STRIPE_CONNECT_CLIENT_ID")
stripe.api_key = STRIPE_SECRET_KEY

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# WhatsApp Cloud API
WHATSAPP_TOKEN            = os.getenv("WHATSAPP_TOKEN") or os.getenv("WHATSAPP_ACCESS_TOKEN")
WHATSAPP_PHONE_ID         = os.getenv("WHATSAPP_PHONE_ID") or os.getenv("WHATSAPP_PHONE_NUMBER_ID")
WHATSAPP_VERIFY_TOKEN     = os.getenv("WHATSAPP_VERIFY_TOKEN", "retainai-verify")
WHATSAPP_WABA_ID          = os.getenv("WHATSAPP_WABA_ID") or os.getenv("WHATSAPP_BUSINESS_ID")
WHATSAPP_TEMPLATE_DEFAULT = os.getenv("WHATSAPP_TEMPLATE_DEFAULT", "retainai_outreach")
WHATSAPP_TEMPLATE_LANG    = os.getenv("WHATSAPP_TEMPLATE_LANG", "en_US")
APP_SECRET                = os.getenv("APP_SECRET") or os.getenv("META_APP_SECRET")
DEFAULT_COUNTRY_CODE      = (os.getenv("DEFAULT_COUNTRY_CODE") or "1").strip()

# Google OAuth
GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI  = os.getenv("GOOGLE_REDIRECT_URI")
GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar",
]

print("[GOOGLE PEOPLE AUTH] client_id=", GOOGLE_CLIENT_ID)
print("[GOOGLE PEOPLE AUTH] redirect_uri=", GOOGLE_REDIRECT_URI)

# SendGrid templates
SG_TEMPLATE_APPT_CONFIRM       = "d-8101601827b94125b6a6a167c4455719"
SG_TEMPLATE_FOLLOWUP_USER      = "d-f239cca5f5634b01ac376a8b8690ef10"
SG_TEMPLATE_WELCOME            = "d-d4051648842b44098e601a3b16190cf9"
SG_TEMPLATE_BIRTHDAY           = "d-94133232d9bd48e0864e21dce34158d3"
SG_TEMPLATE_TRIAL_ENDING       = "d-b7329a138d5b40b096da3ff965407845"
SG_TEMPLATE_FOLLOWUP_LEAD      = "d-b40c227ed00e4cd29fdeb10dcc71a268"
SG_TEMPLATE_REENGAGE_LEAD      = "d-9c6ac36680c8473a84dda817fb58e7b7"
SG_TEMPLATE_APOLOGY_LEAD       = "d-64abfc217ce443d59c2cb411fc85cc74"
SG_TEMPLATE_UPSELL_LEAD        = "d-a7a2c04c57e344aebd6a94559ae71ea9"
SG_TEMPLATE_BDAY_REMINDER_USER = "d-599937685fc544ecb756d9fdb8275a9b"

PROMPT_TYPE_TO_TEMPLATE = {
    "followup":    SG_TEMPLATE_FOLLOWUP_LEAD,
    "reengage":    SG_TEMPLATE_REENGAGE_LEAD,
    "apology":     SG_TEMPLATE_APOLOGY_LEAD,
    "upsell":      SG_TEMPLATE_UPSELL_LEAD,
    "birthday":    SG_TEMPLATE_BIRTHDAY,
    "appointment": SG_TEMPLATE_APPT_CONFIRM,
}

BUSINESS_TYPE_INTERVALS = {
    "nail salon": 5, "real estate": 14, "law firm": 30, "dentist": 7,
    "coaching": 30, "consulting": 21, "spa": 10, "accounting": 30,
}

# ---------------------------------------------------
# Optional blueprints (safe import)
# ---------------------------------------------------
try:
    from app_imports import imports_bp
    app.register_blueprint(imports_bp)
except Exception as e:
    print(f"[BOOT] imports_bp not registered: {e}")

try:
    from app_team import team_bp
    app.register_blueprint(team_bp)
except Exception as e:
    print(f"[BOOT] team_bp not registered: {e}")

try:
    from app_wa_auto_appointments import WA_AUTO_BP
    app.register_blueprint(WA_AUTO_BP)
except Exception as e:
    print(f"[BOOT] WA_AUTO_BP not registered: {e}")

# ---------------------------------------------------
# JSON helpers (atomic)
# ---------------------------------------------------
def load_json(file_path):
    if not os.path.exists(file_path): return {}
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def save_json(file_path, data):
    tmp = f"{file_path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, file_path)

def load_leads():         return load_json(LEADS_FILE)
def save_leads(d):        save_json(LEADS_FILE, d)
def load_users():         return load_json(USERS_FILE)
def save_users(d):        save_json(USERS_FILE, d)
def load_notifications(): return load_json(NOTIFICATIONS_FILE)
def save_notifications(d):save_json(NOTIFICATIONS_FILE, d)
def load_appointments():  return load_json(APPOINTMENTS_FILE)
def save_appointments(d): save_json(APPOINTMENTS_FILE, d)
def load_chats():         return load_json(CHAT_FILE)
def save_chats(d):        save_json(CHAT_FILE, d)
def load_statuses():      return load_json(STATUS_FILE)
def save_statuses(d):     save_json(STATUS_FILE, d)

# One-time migration of legacy files in repo root -> DATA_ROOT
def _migrate_legacy_files():
    import shutil
    legacy_names = [
        "leads.json","users.json","notifications.json","appointments.json",
        "whatsapp_chats.json","whatsapp_status.json"
    ]
    for name in legacy_names:
        src = os.path.join(BASE_DIR, name)
        dst = os.path.join(DATA_ROOT, name)
        try:
            if os.path.exists(src) and not os.path.exists(dst):
                shutil.copy2(src, dst)
                print(f"[DATA MIGRATE] copied {src} -> {dst}")
        except Exception as e:
            print(f"[DATA MIGRATE] failed {src}: {e}")
    legacy_ics = os.path.join(BASE_DIR, "ics_files")
    if os.path.isdir(legacy_ics):
        try:
            for fn in os.listdir(legacy_ics):
                s = os.path.join(legacy_ics, fn)
                d = os.path.join(ICS_DIR, fn)
                if os.path.isfile(s) and not os.path.exists(d):
                    shutil.copy2(s, d)
            print(f"[DATA MIGRATE] ICS files copied to {ICS_DIR}")
        except Exception as e:
            print(f"[DATA MIGRATE] ICS copy failed: {e}")

_migrate_legacy_files()

# ---------------------------------------------------
# Debug helpers
# ---------------------------------------------------
@app.delete("/api/_debug/wipe")
def _debug_wipe_all():
    token = request.headers.get("X-Wipe-Token", "")
    expected = os.getenv("WIPE_TOKEN", "")
    if not expected or token != expected:
        return jsonify({"ok": False, "error": "forbidden"}), 403
    try:
        save_json(LEADS_FILE, {})
        save_json(USERS_FILE, {})
        save_json(NOTIFICATIONS_FILE, {})
        save_json(APPOINTMENTS_FILE, {})
        save_json(CHAT_FILE, {})
        save_json(STATUS_FILE, {})
        for f in (FILE_AUTOMATIONS, FILE_STATE, FILE_NOTIFICATIONS, FILE_USERS):
            tmp = f + ".tmp"; open(tmp, "w").write("{}"); os.replace(tmp, f)
        for fname in os.listdir(ICS_DIR):
            if fname.endswith(".ics"):
                os.remove(os.path.join(ICS_DIR, fname))
        # clear caches if defined later
        try:
            _MSG_CACHE.clear(); _TEMPLATE_CACHE.clear(); _WABA_RES["id"] = None; _WABA_RES["checked_at"] = None
        except Exception: pass
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.get("/api/_debug/storage")
def _debug_storage():
    try:
        leads = load_leads(); users = load_users()
        return jsonify({
            "DATA_ROOT": DATA_ROOT,
            "files": {
                "leads_file": LEADS_FILE,
                "users_file": USERS_FILE,
                "appointments_file": APPOINTMENTS_FILE,
                "chats_file": CHAT_FILE,
                "statuses_file": STATUS_FILE,
            },
            "keys": {
                "leads_users": list(leads.keys())[:10],
                "users_users": list(users.keys())[:10],
            },
            "counts": {
                "num_users_with_leads": len(leads),
                "num_users": len(users),
            }
        })
    except Exception as e:
        return jsonify({"error": str(e), "DATA_ROOT": DATA_ROOT}), 500

# ---------------------------------------------------
# Helpers
# ---------------------------------------------------
def _norm_email(e: str) -> str:
    return unquote(e or "").strip().lower()

def _norm_phone(s: str) -> str:
    d = re.sub(r"\D", "", s or "")
    cc = (os.getenv("DEFAULT_COUNTRY_CODE") or "1").strip()
    if len(d) == 10 and cc.isdigit():
        d = cc + d
    return d

# ---------------------------------------------------
# Users (GET/PUT) — single source of truth
# ---------------------------------------------------
@app.get("/api/user/<path:email>")
def user_get(email):
    e = _norm_email(email)
    users = load_users()
    user = users.get(e)
    if not user:
        # return inert shell so UI can render defaults
        return jsonify({"email": e, "name":"", "picture":"", "businessType":"", "business":"", "people":"", "location":"", "stripe_account_id":None, "stripe_connected":False, "whatsapp":""}), 200
    out = {
        "email":        e,
        "name":         user.get("name",""),
        "logo":         user.get("picture",""),
        "businessType": user.get("businessType",""),
        "business":     user.get("business",""),
        "people":       user.get("people",""),
        "location":     user.get("location",""),
        "stripe_account_id":  user.get("stripe_account_id"),
        "stripe_connected":   user.get("stripe_connected", False),
        "whatsapp":           user.get("whatsapp","")
    }
    return jsonify(out), 200

@app.put("/api/user/<path:email>")
def user_put(email):
    e = _norm_email(email)
    data = request.get_json(silent=True) or {}
    users = load_users()
    cur = users.get(e, {"email": e})
    cur.update(data)  # shallow merge
    users[e] = cur
    save_users(users)
    return jsonify(cur), 200

# ---------------------------------------------------
# Leads — robust, collision-safe, note support
# ---------------------------------------------------
def _ensure_lead_defaults(lead: dict) -> dict:
    now = datetime.datetime.utcnow().isoformat() + "Z"
    out = dict(lead or {})
    out["id"] = str(out.get("id") or uuid4())
    out["createdAt"] = out.get("createdAt") or now
    out["last_contacted"] = out.get("last_contacted") or out["createdAt"]
    out["name"] = (out.get("name")
                   or (out.get("email","").split("@")[0].replace("."," ").title())
                   or "New Lead")
    out.setdefault("tags", [])
    out.setdefault("notes", "")
    return out

def _find_existing_lead_index(arr: list, cand: dict) -> int:
    cid  = str(cand.get("id") or "")
    cem  = _norm_email(cand.get("email"))
    cph  = _norm_phone(cand.get("phone") or cand.get("whatsapp"))
    for i, l in enumerate(arr or []):
        if cid and str(l.get("id")) == cid: return i
        if cem and _norm_email(l.get("email")) == cem: return i
        if cph and (_norm_phone(l.get("phone") or l.get("whatsapp")) == cph): return i
    return -1

@app.get("/api/leads/<path:user_email>", endpoint="leads_get")
def leads_get(user_email):
    user_key = _norm_email(user_email)
    leads_by_user = load_leads()
    leads = leads_by_user.get(user_key, [])

    users = load_users()
    user  = users.get(user_key)
    business_type = (user.get("business", "") if user else "").lower()
    interval = BUSINESS_TYPE_INTERVALS.get(business_type, 14)

    now = datetime.datetime.utcnow()
    out = []
    for lead in leads:
        last = lead.get("last_contacted") or lead.get("createdAt")
        try:
            last_dt = datetime.datetime.fromisoformat(last.replace("Z",""))
            days = (now - last_dt).days
        except Exception:
            days = 0
        if days > interval + 2:
            status, color = "cold", "#e66565"
        elif interval <= days <= interval + 2:
            status, color = "warning", "#f7cb53"
        else:
            status, color = "active", "#1bc982"
        out.append({**lead, "status": status, "status_color": color, "days_since_contact": days})
    return jsonify({"leads": out}), 200

@app.post("/api/leads/<path:user_email>", endpoint="leads_upsert")
def leads_upsert(user_email):
    user_key = _norm_email(user_email)
    payload = request.get_json(silent=True) or {}
    incoming = payload.get("leads")
    if incoming is None and isinstance(payload, dict) and payload:
        incoming = [payload]  # allow single lead object
    if not isinstance(incoming, list):
        return jsonify({"error":"Leads must be a list or a single lead object"}), 400

    db = load_leads()
    arr = list(db.get(user_key, []))

    for raw in incoming:
        lead = _ensure_lead_defaults(raw)
        idx = _find_existing_lead_index(arr, lead)
        if idx >= 0:
            curr = dict(arr[idx])
            merged = {**curr, **lead}
            merged["id"] = str(curr.get("id") or merged.get("id"))
            merged["createdAt"] = curr.get("createdAt") or merged.get("createdAt")
            arr[idx] = merged
        else:
            arr.append(lead)

    db[user_key] = arr
    save_leads(db)
    return jsonify({"message":"Leads upserted","leads":arr}), 200

@app.patch("/api/leads/<path:user_email>/<lead_id>", endpoint="leads_patch")
def leads_patch(user_email, lead_id):
    user_key = _norm_email(user_email)
    patch = request.get_json(silent=True) or {}
    db = load_leads()
    arr = list(db.get(user_key, []))
    for i, l in enumerate(arr):
        if str(l.get("id")) == str(lead_id):
            arr[i] = {**l, **patch, "id": str(l.get("id"))}
            db[user_key] = arr
            save_leads(db)
            return jsonify({"lead": arr[i]}), 200
    return jsonify({"error":"Lead not found"}), 404

@app.route('/api/leads/<path:user_email>/<lead_id>/notes', methods=['POST','PATCH'], endpoint="leads_notes")
def leads_notes(user_email, lead_id):
    user_key = _norm_email(user_email)
    body = request.get_json(silent=True) or {}
    note = (body.get("notes") or body.get("note") or "").strip()
    db = load_leads()
    arr = list(db.get(user_key, []))
    for i, l in enumerate(arr):
        if str(l.get("id")) == str(lead_id):
            arr[i]["notes"] = note
            db[user_key] = arr
            save_leads(db)
            return jsonify({"lead": arr[i]}), 200
    return jsonify({"error":"Lead not found"}), 404

@app.post('/api/leads/<path:user_email>/<lead_id>/contacted', endpoint="leads_contacted")
def leads_contacted(user_email, lead_id):
    user_key = _norm_email(user_email)
    db = load_leads()
    arr = list(db.get(user_key, []))
    for i, l in enumerate(arr):
        if str(l.get("id")) == str(lead_id):
            arr[i]["last_contacted"] = datetime.datetime.utcnow().isoformat() + "Z"
            db[user_key] = arr
            save_leads(db)
            return jsonify({"message":"Lead marked as contacted","lead_id":lead_id}), 200
    return jsonify({"error":"Lead not found"}), 404

# ---------------------------------------------------
# Appointments + ICS
# ---------------------------------------------------
def _create_ics_file(appt):
    uid = appt.get('id')
    dt_start = datetime.datetime.strptime(appt['appointment_time'], "%Y-%m-%dT%H:%M:%S")
    dt_end = dt_start + datetime.timedelta(minutes=int(appt.get("duration", 30)))
    summary = f"Appointment with {appt['user_name']} at {appt['business_name']}"
    description = f"Appointment at {appt['appointment_location']} with {appt['user_name']}"
    ics_content = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//RetainAI//EN
BEGIN:VEVENT
UID:{uid}
DTSTAMP:{dt_start.strftime("%Y%m%dT%H%M%SZ")}
DTSTART:{dt_start.strftime("%Y%m%dT%H%M%SZ")}
DTEND:{dt_end.strftime("%Y%m%dT%H%M%SZ")}
SUMMARY:{summary}
DESCRIPTION:{description}
LOCATION:{appt['appointment_location']}
END:VEVENT
END:VCALENDAR
"""
    fname = f"{uid}.ics"
    with open(os.path.join(ICS_DIR, fname), "w") as f:
        f.write(ics_content)
    return fname

@app.route('/ics/<filename>')
def serve_ics(filename):
    return send_from_directory(ICS_DIR, filename, as_attachment=True)

def _make_google_calendar_link(appt):
    dt_start = datetime.datetime.strptime(appt['appointment_time'], "%Y-%m-%dT%H:%M:%S")
    dt_end = dt_start + datetime.timedelta(minutes=int(appt.get("duration", 30)))
    start_str = dt_start.strftime("%Y%m%dT%H%M%SZ")
    end_str = dt_end.strftime("%Y%m%dT%H%M%SZ")
    title = f"Appointment with {appt['user_name']} at {appt['business_name']}"
    location = appt['appointment_location'].replace(" ", "+")
    details = f"Appointment with {appt['user_name']} at {appt['business_name']}."
    return (
        f"https://calendar.google.com/calendar/render?action=TEMPLATE"
        f"&text={title.replace(' ','+')}"
        f"&dates={start_str}/{end_str}"
        f"&details={details.replace(' ','+')}"
        f"&location={location}"
    )

@app.get('/api/appointments/<user_email>')
def get_appointments(user_email):
    data = load_appointments()
    return jsonify({"appointments": data.get(_norm_email(user_email), [])}), 200

@app.post('/api/appointments/<user_email>')
def create_appointment(user_email):
    data = request.json or {}
    appt = {
        "id": str(uuid4()),
        "lead_email": data['lead_email'],
        "lead_first_name": data['lead_first_name'],
        "user_name": data['user_name'],
        "user_email": data['user_email'],
        "business_name": data['business_name'],
        "appointment_time": data['appointment_time'],
        "appointment_location": data['appointment_location'],
        "duration": data.get('duration', 30),
        "notes": data.get('notes', "")
    }
    appointments = load_appointments()
    key = _norm_email(user_email)
    appointments.setdefault(key, []).append(appt)
    save_appointments(appointments)
    _create_ics_file(appt)

    display_time = datetime.datetime.strptime(appt['appointment_time'], "%Y-%m-%dT%H:%M:%S").strftime("%B %d, %Y, %I:%M %p")
    ics_file_url = f"{request.host_url.rstrip('/')}/ics/{appt['id']}.ics"
    google_calendar_link = _make_google_calendar_link(appt)
    _ = send_email_with_template(   # defined in Part 2
        to_email=appt['lead_email'],
        template_id=SG_TEMPLATE_APPT_CONFIRM,
        dynamic_data={
            "lead_first_name": appt["lead_first_name"],
            "user_name": appt["user_name"],
            "business_name": appt["business_name"],
            "display_time": display_time,
            "appointment_location": appt["appointment_location"],
            "google_calendar_link": google_calendar_link,
            "ics_file_url": ics_file_url,
            "user_email": appt["user_email"]
        }
    )
    return jsonify({"message": "Appointment created and confirmation sent!", "appointment": appt}), 201

@app.put('/api/appointments/<user_email>/<appt_id>')
def update_appointment(user_email, appt_id):
    data = request.json or {}
    appointments = load_appointments()
    key = _norm_email(user_email)
    user_appts = appointments.get(key, [])
    updated = False; idx = -1
    for i, appt in enumerate(user_appts):
        if appt['id'] == appt_id:
            for k in data: user_appts[i][k] = data[k]
            updated = True; idx = i
            _create_ics_file(user_appts[i])
            break
    appointments[key] = user_appts
    save_appointments(appointments)
    return jsonify({"updated": updated, "appointment": user_appts[idx] if updated else None}), 200

@app.delete('/api/appointments/<user_email>/<appt_id>')
def delete_appointment(user_email, appt_id):
    appointments = load_appointments()
    key = _norm_email(user_email)
    user_appts = appointments.get(key, [])
    before = len(user_appts)
    user_appts = [a for a in user_appts if a['id'] != appt_id]
    after = len(user_appts)
    appointments[key] = user_appts
    save_appointments(appointments)
    fname = os.path.join(ICS_DIR, f"{appt_id}.ics")
    if os.path.exists(fname):
        os.remove(fname)
    return jsonify({"deleted": before - after}), 200
# ==========================
# app.py  (Part 2 of 3)
# Email helpers, Stripe, Auth, Google OAuth/Calendar, basic prompts
# ==========================

# ----------------------------
# Email via SendGrid
# ----------------------------
def send_email_with_template(to_email, template_id, dynamic_data, subject=None, from_email=None, reply_to_email=None) -> bool:
    if not SENDGRID_API_KEY:
        print("[SENDGRID] SENDGRID_API_KEY missing; skipping send (simulated ok).")
        return True  # simulate success so UI flows continue in staging
    from_email = from_email or SENDER_EMAIL
    subject = subject or "Message from RetainAI"
    dynamic_data = dict(dynamic_data or {})
    dynamic_data.setdefault("subject", subject)

    try:
        msg = Mail(from_email=from_email, to_emails=to_email, subject=subject)
        msg.template_id = template_id
        msg.dynamic_template_data = dynamic_data
        if reply_to_email:
            msg.reply_to = Email(reply_to_email)

        sg = SendGridAPIClient(SENDGRID_API_KEY)
        resp = sg.send(msg)
        print(f"[SENDGRID] Status {resp.status_code} → {to_email} | template={template_id}")
        return 200 <= resp.status_code < 300
    except Exception as e:
        print(f"[SENDGRID ERROR] to={to_email} err={e}")
        return False

def send_welcome_email(to_email, user_name=None, business_type=None):
    send_email_with_template(
        to_email=to_email,
        template_id=SG_TEMPLATE_WELCOME,
        dynamic_data={"user_name": user_name or "", "business_type": business_type or ""},
        subject="Welcome to RetainAI",
        from_email="welcome@retainai.ca"
    )

def send_birthday_email(lead_email, lead_name, business_name):
    send_email_with_template(
        to_email=lead_email,
        template_id=SG_TEMPLATE_BIRTHDAY,
        dynamic_data={"lead_name": lead_name, "business_name": business_name},
        subject=f"Happy Birthday, {lead_name}! 🎉",
    )

def send_birthday_reminder_to_user(user_email, user_name, lead_name, business_name, birthday):
    send_email_with_template(
        to_email=user_email,
        template_id=SG_TEMPLATE_BDAY_REMINDER_USER,
        dynamic_data={
            "user_name": user_name, "lead_name": lead_name,
            "business_name": business_name, "birthday": birthday
        },
        subject=f"Birthday Reminder: {lead_name}'s birthday is tomorrow!",
        from_email="reminder@retainai.ca"
    )

def send_trial_ending_email(user_email, user_name, business_name, trial_end_date):
    send_email_with_template(
        to_email=user_email,
        template_id=SG_TEMPLATE_TRIAL_ENDING,
        dynamic_data={"user_name": user_name, "business_name": business_name, "trial_end_date": trial_end_date},
        subject="Your RetainAI trial is ending soon",
    )

def send_followup_reminder(user_email, lead):
    send_email_with_template(
        to_email=user_email,
        template_id=SG_TEMPLATE_FOLLOWUP_USER,
        dynamic_data={
            "lead_name": lead.get("name", ""),
            "lead_email": lead.get("email", ""),
            "user_email": user_email or "",
            "last_contacted": lead.get("last_contacted", ""),
            "notes": lead.get("notes", ""),
            "tags": ', '.join(lead.get("tags", []))
        },
        subject="Leads needing attention",
    )

# ----------------------------
# Simple prompt generator (UI helper)
# ----------------------------
@app.post("/api/generate_prompt")
def prompts_generate_basic():
    payload   = request.get_json(silent=True) or {}
    ptype     = (payload.get("type") or "followup").lower().strip()
    lead_name = payload.get("name") or payload.get("lead_name") or "there"
    business  = payload.get("business") or payload.get("businessName") or "our team"

    templates = {
        "followup":   f"Hi {lead_name}, just following up from {business}. When's a good time to chat?",
        "reengage":   f"Hey {lead_name}, checking back in. We'd love to help you at {business}. Want to pick a time?",
        "apology":    f"Hi {lead_name}, sorry we missed you earlier. If you're still interested, we can make it right.",
        "upsell":     f"Hi {lead_name}, quick note — we can add an upgrade to your plan. Want the details?",
        "birthday":   f"Happy Birthday, {lead_name}! 🎉 Wishing you the best — {business}.",
        "appointment":f"Hi {lead_name}, your appointment with {business} is confirmed. See you soon!",
    }
    text = templates.get(ptype, templates["followup"])
    return jsonify({"text": text, "type": ptype}), 200

# Dedicated route to send AI-written message using a SendGrid template
@app.post('/api/send-ai-message')
def send_ai_message_v1():
    try:
        body = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON payload"}), 400

    lead_email    = (body.get("leadEmail") or "").strip()
    user_email    = (body.get("userEmail") or "").strip()
    subject       = (body.get("subject") or "").strip() or "Message from RetainAI"
    message       = (body.get("message") or "").strip()
    prompt_type   = (body.get("promptType") or "followup").strip().lower()

    lead_name     = (body.get("leadName") or "").strip()
    user_name     = (body.get("userName") or "").strip()
    business_name = (body.get("businessName") or "").strip()

    if not lead_email or not message:
        return jsonify({"error": "leadEmail and message are required"}), 400

    template_id = PROMPT_TYPE_TO_TEMPLATE.get(prompt_type) or PROMPT_TYPE_TO_TEMPLATE.get("followup")
    if not template_id:
        return jsonify({"error": "No template configured for this promptType"}), 500

    first_name = (lead_name.split(" ", 1)[0] if lead_name else "")
    dynamic = {
        "subject": subject,
        "lead_name": lead_name,
        "lead_first_name": first_name,
        "user_name": user_name,
        "business_name": business_name,
        "message": message,
        "message_body": message,
        "body": message,
        "year": datetime.datetime.now().year,
        "prompt_type": prompt_type,
    }

    accepted = send_email_with_template(
        to_email=lead_email,
        template_id=template_id,
        dynamic_data=dynamic,
        subject=subject,
        from_email=SENDER_EMAIL,
        reply_to_email=user_email or None
    )
    if not accepted:
        return jsonify({"ok": False, "template_id": template_id, "accepted": False}), 502
    return jsonify({"ok": True, "template_id": template_id, "accepted": True}), 200

# ----------------------------
# Stripe Connect / Billing
# ----------------------------
ZERO_DECIMAL = {"bif","clp","djf","gnf","jpy","kmf","krw","mga","pyg","rwf","ugx","vnd","vuv","xaf","xof","xpf"}

def to_minor(amount, currency):
    c = (currency or "usd").lower()
    return int(round(float(amount) * (1 if c in ZERO_DECIMAL else 100)))

def from_minor(value, currency):
    c = (currency or "usd").lower()
    denom = 1 if c in ZERO_DECIMAL else 100.0
    return (value or 0) / denom

def get_connected_acct(user_email: str):
    users = load_users()
    return users.get(user_email, {}).get("stripe_account_id")

def serialize_invoice(inv):
    currency = inv.currency
    cust_name = (
        (inv.customer.name if hasattr(inv.customer, "name") else None)
        or inv.metadata.get("customer_name")
        or inv.customer_email
    )
    amount_total = from_minor(getattr(inv, "total", None) or inv.amount_due, currency)
    amount_due   = from_minor(inv.amount_due, currency)
    amount_paid  = from_minor(getattr(inv, "amount_paid", 0), currency)
    display      = amount_total if inv.status == "paid" else amount_due
    return {
        "id": inv.id,
        "customer_name": cust_name,
        "customer_email": inv.customer_email,
        "amount_total": round(amount_total, 2),
        "amount_due":   round(amount_due, 2),
        "amount_paid":  round(amount_paid, 2),
        "amount_display": round(display, 2),
        "currency": currency,
        "due_date": inv.due_date,
        "status": inv.status,
        "invoice_url": inv.hosted_invoice_url
    }

@app.get("/api/stripe/connect-url")
def stripe_connect_url():
    user_email = request.args.get("user_email")
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
        account=acct.id,
        refresh_url=refresh_url,
        return_url=return_url,
        type="account_onboarding",
    )
    return jsonify({"url": link.url}), 200

@app.get("/api/stripe/oauth/connect")
def stripe_oauth_connect():
    user_email = request.args.get("user_email")
    if not user_email:
        return jsonify({"error": "Missing user_email"}), 400
    redirect_uri = os.getenv("STRIPE_REDIRECT_URI")
    oauth_url = (
        "https://connect.stripe.com/oauth/authorize"
        f"?response_type=code"
        f"&client_id={STRIPE_CONNECT_CLIENT_ID}"
        f"&scope=read_write"
        f"&redirect_uri={redirect_uri}"
        f"&state={user_email}"
    )
    return jsonify({"url": oauth_url}), 200

@app.get("/api/stripe/dashboard-link")
def stripe_dashboard_link():
    user_email = request.args.get("user_email")
    if not user_email:
        return jsonify({"error": "Missing user_email"}), 400
    users = load_users()
    acct_id = users.get(user_email, {}).get("stripe_account_id")
    if not acct_id:
        return jsonify({"error": "Stripe account not connected"}), 400
    acct = stripe.Account.retrieve(acct_id)
    if acct.type in ("express", "custom"):
        link = stripe.Account.create_login_link(acct_id)
        return jsonify({"url": link.url}), 200
    else:
        return jsonify({"url": f"https://dashboard.stripe.com/{acct_id}"}), 200

@app.get("/api/stripe/oauth/callback")
def stripe_oauth_callback():
    error      = request.args.get("error")
    error_desc = request.args.get("error_description", "")
    user_email = request.args.get("state")
    frontend   = FRONTEND_URL
    if error:
        msg = urllib.parse.quote_plus(error_desc)
        return redirect(f"{frontend}/app?stripe_error=1&stripe_error_desc={msg}")
    code = request.args.get("code")
    if not code or not user_email:
        return redirect(f"{frontend}/app?stripe_error=1&stripe_error_desc=missing_code_or_state")
    resp = stripe.OAuth.token(grant_type="authorization_code", code=code)
    stripe_user_id = resp["stripe_user_id"]
    users = load_users()
    users.setdefault(user_email, {})
    users[user_email]["stripe_account_id"] = stripe_user_id
    users[user_email]["stripe_connected"]  = True
    save_users(users)
    return redirect(f"{frontend}/app?stripe_connected=1")

@app.get("/api/stripe/account")
def get_stripe_account():
    user_email = request.args.get("user_email")
    if not user_email:
        return jsonify({"error": "Missing user_email"}), 400
    acct_id = get_connected_acct(user_email)
    if not acct_id:
        return jsonify({"error": "Stripe account not connected"}), 404
    acct = stripe.Account.retrieve(acct_id)
    return jsonify({
        "account": {
            "id": acct.id,
            "default_currency": acct.default_currency,
            "details_submitted": acct.details_submitted,
            "email": acct.email
        }
    }), 200

@app.post('/api/stripe/invoice')
def create_stripe_invoice():
    data = request.json or {}
    user_email     = data.get("user_email")
    customer_name  = data.get("customer_name")
    customer_email = data.get("customer_email")
    amount         = data.get("amount")
    description    = data.get("description")
    currency       = (data.get("currency") or "").lower().strip() or None
    quantity       = int(data.get("quantity") or 1)

    if not all([user_email, customer_name, customer_email, description, amount]):
        return jsonify({"error": "Missing required fields"}), 400
    try:
        total_float = float(amount)
        assert total_float > 0
    except Exception:
        return jsonify({"error": "Amount must be a number greater than 0"}), 400

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
            customer=cust_id,
            collection_method="send_invoice",
            days_until_due=7,
            auto_advance=False,
            metadata={"user_email": user_email, "customer_name": customer_name},
            stripe_account=acct_id,
        )

        total_minor = to_minor(total_float, currency)
        stripe.InvoiceItem.create(
            customer=cust_id,
            invoice=inv.id,
            amount=total_minor,
            currency=currency,
            description=description,
            metadata={"user_email": user_email, "customer_name": customer_name, "quantity": quantity},
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
            "invoices": invoices
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.get('/api/stripe/invoices')
def list_stripe_invoices():
    user_email = request.args.get("user_email")
    if not user_email:
        return jsonify({"error": "Missing user_email"}), 400
    acct_id = get_connected_acct(user_email)
    if not acct_id:
        return jsonify({"error": "Stripe account not connected"}), 400

    invs = stripe.Invoice.list(limit=100, expand=["data.customer"], stripe_account=acct_id).data
    out = [serialize_invoice(inv) for inv in invs]
    return jsonify({"invoices": out}), 200

@app.post('/api/stripe/invoice/send')
def resend_invoice_email():
    data = request.json or {}
    invoice_id = data.get("invoice_id")
    user_email = data.get("user_email")
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
          <p>Hi {inv.metadata.get("customer_name","")},</p>
          <p>Your invoice <strong>#{inv.number}</strong> from <strong>{business}</strong> is now available.</p>
          <p><strong>Amount:</strong> {total:.2f} {inv.currency.upper()}</p>
          <p><a href="{inv.hosted_invoice_url}">View &amp; pay your invoice →</a></p>
          <br/>
          <p>Thanks for working with {business}!</p>
        """
        msg = Mail(
          from_email=Email("billing@retainai.ca", name=f"{user_name} at {business}"),
          to_emails=cust.email,
          subject=f"Invoice #{inv.number} from {business}",
          html_content=html
        )
        SendGridAPIClient(SENDGRID_API_KEY).send(msg)
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.post("/api/stripe/webhook")
def stripe_webhook():
    payload = request.data
    sig_header = request.headers.get('stripe-signature')
    endpoint_secret = STRIPE_WEBHOOK_SECRET
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
    except Exception:
        return '', 400
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        email = session.get('customer_email')
        if email:
            users = load_users()
            user = users.get(email)
            if user:
                user['status'] = 'active'
                save_users(users)
    return '', 200

@app.post("/api/stripe/disconnect")
def stripe_disconnect():
    user_email = request.args.get("user_email")
    if not user_email:
        return jsonify({"error": "Missing user_email"}), 400
    users = load_users()
    user = users.get(user_email)
    if not user or not user.get("stripe_account_id"):
        return jsonify({"error": "No Stripe account to disconnect"}), 400
    acct_id = user["stripe_account_id"]
    try:
        stripe.OAuth.deauthorize(client_id=STRIPE_CONNECT_CLIENT_ID, stripe_user_id=acct_id)
    except Exception as e:
        app.logger.warning(f"Stripe deauth failed for {acct_id}: {e}")
    user.pop("stripe_account_id", None)
    user["stripe_connected"] = False
    save_users(users)
    return ("", 204)

# ----------------------------
# Auth & Google OAuth
# ----------------------------
@app.post('/api/signup')
def signup_v1():
    data = request.json or {}
    email        = data.get('email')
    password     = data.get('password')
    businessType = data.get('businessType','')
    businessName = data.get('businessName',businessType)
    name         = data.get('name','')
    teamSize     = data.get('teamSize','')
    logo         = data.get('logo','')
    users = load_users()
    if not email or not password:
        return jsonify({'error':'Email and password required'}), 400
    if email in users:
        return jsonify({'error':'User already exists'}), 409
    trial_start = datetime.datetime.utcnow().isoformat()
    users[email] = {
        'password':              password,
        'businessType':          businessType,
        'business':              businessName,
        'name':                  name,
        'teamSize':              teamSize,
        'picture':               logo,
        'status':                'pending_payment',
        'trial_start':           trial_start,
        'trial_ending_notice_sent': False
    }
    save_users(users)
    try:
        send_welcome_email(email, name, businessName)
    except Exception as e:
        print(f"[WARN] Couldn't send welcome email: {e}")
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
        print(f"[STRIPE ERROR] {e}")
        return jsonify({'error': 'Could not start payment process.'}), 500

@app.post('/api/login')
def login_v1():
    data     = request.json or {}
    email    = data.get('email')
    password = data.get('password')
    users    = load_users()
    user     = users.get(email)
    if not user or user.get('password') != password or user.get('status') != 'active':
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
            'stripe_connected':  user.get('stripe_connected', False)
        }
    }), 200

@app.post('/api/oauth/google')
def google_oauth_v1():
    data = request.json or {}
    token = data.get('credential')
    if not token:
        return jsonify({'error': 'No Google token provided'}), 400
    try:
        idinfo = id_token.verify_oauth2_token(token, grequests.Request(), GOOGLE_CLIENT_ID)
        email   = idinfo['email']
        name    = idinfo.get('name', '')
        picture = idinfo.get('picture', '')
        users = load_users()
        user  = users.get(email, {})
        if not user:
            trial_start = datetime.datetime.utcnow().isoformat()
            users[email] = {
                'password': None,
                'businessType': '',
                'business': '',
                'name': name,
                'picture': picture,
                'people': '',
                'trial_start': trial_start,
                'status': 'pending_payment',
                'trial_ending_notice_sent': False
            }
        else:
            if not user.get('name') and name:
                user['name'] = name
            if not user.get('picture') and picture:
                user['picture'] = picture
        save_users(users)
        return jsonify({
            'message': 'Google login successful',
            'user': {
                'email':             email,
                'name':              users[email].get('name', name),
                'logo':              users[email].get('picture', picture),
                'businessType':      users[email].get('businessType', ''),
                'people':            users[email].get('people', ''),
                'stripe_account_id': users[email].get('stripe_account_id'),
                'stripe_connected':  users[email].get('stripe_connected', False)
            }
        }), 200
    except Exception as e:
        print("[GOOGLE OAUTH ERROR]", e)
        return jsonify({'error': 'Invalid Google token'}), 401

@app.post('/api/oauth/google/complete')
def google_oauth_complete_v1():
    data         = request.json or {}
    email        = data.get('email')
    businessType = data.get('businessType','')
    businessName = data.get('businessName', businessType)
    name         = data.get('name','')
    logo         = data.get('logo','')
    people       = data.get('people','')
    users = load_users()
    if not email or email not in users:
        return jsonify({'error': 'User not found'}), 404
    users[email].update({
        'businessType': businessType,
        'business':     businessName,
        'name':         name,
        'picture':      logo,
        'people':       people
    })
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
            'stripe_account_id': users[email].get('stripe_account_id'),
            'stripe_connected':  users[email].get('stripe_connected', False)
        }
    }), 200

# ----------------------------
# Google Calendar integration
# ----------------------------
@app.get("/api/google/auth-url")
def google_auth_url():
    email = request.args.get("user_email")
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
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)
    return jsonify({"url": url})

@app.get("/api/google/oauth-callback")
def google_oauth_cb():
    code = request.args.get("code")
    error = request.args.get("error")
    state = request.args.get("state")
    if error:
        return f"Google OAuth error: {error}", 400
    if not code or not state:
        return "Missing code or state", 400
    data = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    token_resp = pyrequests.post("https://oauth2.googleapis.com/token", data=data)
    tokens = token_resp.json()
    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    if not access_token or not refresh_token:
        return "Failed to obtain tokens", 400
    cal_resp = pyrequests.get(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    calendars = cal_resp.json().get("items", [])
    users = load_users()
    user = users.get(state, {})
    user["gcal_connected"] = True
    user["gcal_access_token"] = access_token
    user["gcal_refresh_token"] = refresh_token
    user["gcal_calendars"] = [
        {"id": c["id"], "summary": c.get("summary"), "primary": c.get("primary", False)}
        for c in calendars
    ]
    users[state] = user
    save_users(users)
    return "Google Calendar connected! You may close this tab and return to the app."

@app.get("/api/google/status/<path:email>")
def google_status(email):
    users = load_users()
    user = users.get(email)
    if not user or not user.get("gcal_connected"):
        return jsonify({"connected": False})
    return jsonify({"connected": True, "calendars": user.get("gcal_calendars", [])})

@app.post("/api/google/disconnect/<path:email>")
def google_disconnect(email):
    users = load_users()
    user = users.get(email)
    if user:
        user.pop("gcal_access_token", None)
        user.pop("gcal_refresh_token", None)
        user["gcal_connected"] = False
        user.pop("gcal_calendars", None)
        users[email] = user
        save_users(users)
        return jsonify({"disconnected": True})
    return jsonify({"disconnected": False})

@app.get("/api/google/calendars/<path:email>")
def google_calendars(email):
    users = load_users()
    user = users.get(email)
    if not user or not user.get("gcal_access_token"):
        return jsonify({"error": "Not connected"}), 401
    access_token = user["gcal_access_token"]
    resp = pyrequests.get(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    if resp.status_code != 200:
        return jsonify({"error": resp.text}), 500
    items = resp.json().get("items", [])
    out = [{"id": c["id"], "summary": c.get("summary"), "primary": c.get("primary", False)} for c in items]
    return jsonify({"calendars": out})

@app.get("/api/google/events/<path:email>")
def google_events(email):
    calendar_id = request.args.get("calendarId")
    users = load_users()
    user = users.get(email)
    if not user or not user.get("gcal_connected"):
        return jsonify({"error": "Not connected"}), 401
    access_token = user.get("gcal_access_token")
    if not access_token:
        return jsonify({"error": "No access token"}), 401
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
        f"{urllib.parse.quote(calendar_id)}/events"
        f"?timeMin={now}&timeMax={max_time}&singleEvents=true&orderBy=startTime"
    )
    resp = pyrequests.get(url, headers={"Authorization": f"Bearer {access_token}"})
    if resp.status_code != 200:
        return jsonify({"error": resp.text}), 500
    return jsonify(resp.json())
# ==========================
# app.py  (Part 3 of 3)
# WhatsApp Cloud API, Automations Engine, Leads/Notes, Notifications, Scheduler
# ==========================
import os, re, json, uuid, datetime
from flask import Blueprint, request, jsonify, redirect
import requests as pyrequests

# NOTE: This part assumes Part 1 defined:
#   app, FRONTEND_URL, DATA_ROOT
#   atomic read/write helpers: load_users(), save_users(), load_leads(), save_leads(),
#   load_chats(), save_chats(), load_notifications(), save_notifications(),
#   SENDGRID_API_KEY/SENDER_EMAIL, STRIPE_* constants, etc.

# -------------------------------------------------------------------
# WhatsApp Cloud API — 24h window, templates, webhook, opt-in/out
# (all helper names prefixed with wa_ to avoid collisions)
# -------------------------------------------------------------------
_WA_TEMPLATE_CACHE = {}   # (name, lang_norm) -> {"status": "...", "checked_at": datetime}
_WA_TEMPLATE_TTL_S = 300

_WA_WABA_CACHE = {"id": None, "checked_at": None}
_WA_WABA_TTL_S = 300

_WA_MSG_CACHE = {}  # key=(user_email,lead_id) -> {"at": datetime, "data": [...]}
_WA_MSG_CACHE_TTL_SECONDS = 2

def wa_normalize_lang(code: str) -> str:
    if not code:
        code = os.getenv("WHATSAPP_TEMPLATE_LANG", "en")
    c = str(code).replace("-", "_").strip()
    parts = c.split("_")
    if len(parts) == 1:
        return parts[0].lower()
    if len(parts) >= 2 and parts[0] and parts[1]:
        return parts[0].lower() + "_" + parts[1].upper()
    return c.lower()

def wa_primary_lang(code: str) -> str:
    if not code:
        return ""
    return code.replace("-", "_").split("_", 1)[0].lower()

def wa_digits(s: str) -> str:
    d = re.sub(r"\D", "", s or "")
    dcc = os.getenv("DEFAULT_COUNTRY_CODE", "1")
    if len(d) == 10 and dcc.isdigit():
        d = dcc + d
    return d

def wa_env():
    token = os.getenv("WHATSAPP_TOKEN")
    phone_id = os.getenv("WHATSAPP_PHONE_ID")
    if not token or not phone_id:
        raise RuntimeError("WhatsApp credentials missing")
    return token, phone_id

def wa_lead_matches(lead, number_digits: str) -> bool:
    for key in ("whatsapp", "phone"):
        if wa_digits(lead.get(key)) == number_digits:
            return True
    return False

def wa_find_user_by_waid(wa_id: str):
    d = wa_digits(wa_id)
    leads_by_user = load_leads()
    for user_email, leads in leads_by_user.items():
        for lead in leads:
            if wa_lead_matches(lead, d):
                return user_email
    return None

def wa_find_lead_id_by_waid(wa_id: str):
    d = wa_digits(wa_id)
    leads_by_user = load_leads()
    for _, leads in leads_by_user.items():
        for lead in leads:
            if wa_lead_matches(lead, d):
                return lead.get("id")
    return None

def wa_resolve_waba_id(force: bool = False) -> str:
    now = datetime.datetime.utcnow()
    if (not force
        and _WA_WABA_CACHE["id"]
        and _WA_WABA_CACHE["checked_at"]
        and (now - _WA_WABA_CACHE["checked_at"]).total_seconds() < _WA_WABA_TTL_S):
        return _WA_WABA_CACHE["id"]
    try:
        token, phone_id = wa_env()
        url = f"https://graph.facebook.com/v20.0/{phone_id}"
        headers = {"Authorization": f"Bearer {token}"}
        params = {"fields": "whatsapp_business_account{id},display_phone_number"}
        r = pyrequests.get(url, headers=headers, params=params, timeout=30)
        wid = None
        if r.ok:
            wid = (((r.json() or {}).get("whatsapp_business_account") or {}).get("id"))
        if not wid:
            wid = os.getenv("WHATSAPP_WABA_ID") or os.getenv("WHATSAPP_BUSINESS_ID", "")
        _WA_WABA_CACHE["id"] = wid
        _WA_WABA_CACHE["checked_at"] = now
        app.logger.info("[WA] resolved WABA id=%s", wid)
        return wid
    except Exception as e:
        app.logger.warning("[WA] resolve error: %s", e)
        return os.getenv("WHATSAPP_WABA_ID") or os.getenv("WHATSAPP_BUSINESS_ID", "")

def wa_fetch_templates_raw():
    waba_id = wa_resolve_waba_id()
    url = f"https://graph.facebook.com/v20.0/{waba_id}/message_templates"
    params = {"fields": "name,language,status,category,components", "limit": 200}
    headers = {"Authorization": f"Bearer {os.getenv('WHATSAPP_TOKEN')}"}
    return pyrequests.get(url, headers=headers, params=params, timeout=30)

def wa_lookup_template_status(name: str, lang_api: str, force: bool = False) -> str:
    if not (os.getenv("WHATSAPP_WABA_ID") or os.getenv("WHATSAPP_PHONE_ID")):
        return "UNKNOWN"

    normalized_name = (name or os.getenv("WHATSAPP_TEMPLATE_DEFAULT", "") or "").strip()
    lang_norm = wa_normalize_lang(lang_api or os.getenv("WHATSAPP_TEMPLATE_LANG", "en") or "")
    key = (normalized_name, lang_norm)

    now = datetime.datetime.utcnow()
    if not force:
        cached = _WA_TEMPLATE_CACHE.get(key)
        if cached and (now - cached["checked_at"]).total_seconds() < _WA_TEMPLATE_TTL_S:
            return cached["status"]

    try:
        r = wa_fetch_templates_raw()
        items = (r.json() or {}).get("data", []) if r.ok else []
        primary = wa_primary_lang(lang_norm)
        exact_status, fallback_status = None, None
        for t in items:
            if (t.get("name") or "") != normalized_name:
                continue
            tl_norm = wa_normalize_lang(t.get("language") or "")
            if tl_norm == lang_norm:
                exact_status = (t.get("status") or "UNKNOWN")
            if wa_primary_lang(tl_norm) == primary:
                st = (t.get("status") or "UNKNOWN")
                if (fallback_status or "").upper() != "APPROVED":
                    fallback_status = st
        status = exact_status or fallback_status or "PENDING"
        _WA_TEMPLATE_CACHE[key] = {"status": status, "checked_at": now}
        return status
    except Exception as e:
        app.logger.warning(f"[WA TPL CHECK ERROR] {e}")
        _WA_TEMPLATE_CACHE[key] = {"status": "UNKNOWN", "checked_at": now}
        return "UNKNOWN"

def wa_is_template_approved(name: str, lang: str, force: bool = False) -> bool:
    return wa_lookup_template_status(name, lang, force).upper() == "APPROVED"

def wa_within_24h(user_email: str, lead_id: str) -> bool:
    chats = load_chats()
    msgs = (chats.get(user_email, {}) or {}).get(str(lead_id), []) or []
    for m in reversed(msgs):
        if m.get("from") == "lead":
            ts = m.get("time")
            try:
                last_dt = datetime.datetime.fromisoformat(ts.replace("Z", ""))
            except Exception:
                return False
            return (datetime.datetime.utcnow() - last_dt) <= datetime.timedelta(hours=24)
    return False

def wa_send_text(to_number: str, body: str):
    token, phone_id = wa_env()
    ver = os.getenv("WHATSAPP_API_VERSION", "v20.0")
    url = f"https://graph.facebook.com/{ver}/{phone_id}/messages"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"messaging_product": "whatsapp", "to": wa_digits(to_number), "type": "text", "text": {"body": body}}
    resp = pyrequests.post(url, headers=headers, json=payload, timeout=30)
    if resp.status_code >= 400:
        app.logger.error("[WA SEND ERROR] %s %s", resp.status_code, resp.text)
    return resp

def wa_send_template(to_number: str, template_name: str, lang_code: str, parameters: list | None = None):
    token, phone_id = wa_env()
    ver = os.getenv("WHATSAPP_API_VERSION", "v20.0")
    url = f"https://graph.facebook.com/{ver}/{phone_id}/messages"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    components = []
    if parameters is not None:
        components = [{"type": "body", "parameters": [{"type": "text", "text": str(p)} for p in parameters]}]
    payload = {
        "messaging_product": "whatsapp",
        "to": wa_digits(to_number),
        "type": "template",
        "template": {"name": template_name, "language": {"code": wa_normalize_lang(lang_code)}, "components": components}
    }
    resp = pyrequests.post(url, headers=headers, json=payload, timeout=30)
    if resp.status_code >= 400:
        app.logger.error("[WA TEMPLATE ERROR] %s %s", resp.status_code, resp.text)
    return resp

def _wa_thread_cached(user_email, lead_id):
    key = (str(user_email or ""), str(lead_id or ""))
    now = datetime.datetime.utcnow()
    cached = _WA_MSG_CACHE.get(key)
    if cached and (now - cached["at"]).total_seconds() < _WA_MSG_CACHE_TTL_SECONDS:
        return cached["data"], True
    chats = load_chats()
    msgs = (chats.get(user_email, {}) or {}).get(str(lead_id), []) or []
    _WA_MSG_CACHE[key] = {"at": now, "data": msgs}
    return msgs, False

@app.get("/api/whatsapp/health")
def whatsapp_health():
    return jsonify({
        "ok": True,
        "has_token": bool(os.getenv("WHATSAPP_TOKEN")),
        "has_phone_id": bool(os.getenv("WHATSAPP_PHONE_ID")),
        "has_waba_id": bool(os.getenv("WHATSAPP_WABA_ID")),
        "default_template": os.getenv("WHATSAPP_TEMPLATE_DEFAULT"),
        "default_lang_ui": wa_primary_lang(os.getenv("WHATSAPP_TEMPLATE_LANG", "en")) or "en",
        "default_lang_api": wa_normalize_lang(os.getenv("WHATSAPP_TEMPLATE_LANG", "en")),
    }), 200

@app.get("/api/whatsapp/templates")
def whatsapp_list_templates():
    if not os.getenv("WHATSAPP_TOKEN") or not os.getenv("WHATSAPP_PHONE_ID"):
        return jsonify({"error": "Missing token or phone id"}), 400
    waba_id = wa_resolve_waba_id()
    r = wa_fetch_templates_raw()
    try:
        data = r.json()
        for t in data.get("data", []):
            t["normalized_language"] = wa_normalize_lang(t.get("language",""))
    except Exception:
        data = {"raw": r.text}
    return jsonify({"status": getattr(r, "status_code", None), "waba_id": waba_id, "data": data}), getattr(r, "status_code", 200)

@app.get("/api/whatsapp/template-state")
def whatsapp_template_state():
    name = (request.args.get("name") or os.getenv("WHATSAPP_TEMPLATE_DEFAULT", "") or "").strip()
    lang = request.args.get("language_code") or os.getenv("WHATSAPP_TEMPLATE_LANG", "en") or ""
    force = request.args.get("force") == "1"
    status = wa_lookup_template_status(name, lang, force)
    return jsonify({
        "name": name,
        "language": wa_normalize_lang(lang),
        "status": status.upper(),
        "approved": status.upper() == "APPROVED",
        "checked_at": datetime.datetime.utcnow().isoformat() + "Z"
    }), 200

@app.get("/api/whatsapp/window-state")
def whatsapp_window_state():
    user_email = request.args.get("user_email", "")
    lead_id    = request.args.get("lead_id", "")
    template_name = (request.args.get("template_name") or os.getenv("WHATSAPP_TEMPLATE_DEFAULT", "") or "").strip()
    lang_code     = request.args.get("language_code") or os.getenv("WHATSAPP_TEMPLATE_LANG", "en") or ""
    force = request.args.get("force") == "1"

    lang_norm = wa_normalize_lang(lang_code)
    inside = wa_within_24h(user_email, lead_id)
    status = "APPROVED" if inside else wa_lookup_template_status(template_name, lang_norm, force)

    return jsonify({
        "inside24h": inside,
        "templateApproved": inside or (status.upper() == "APPROVED"),
        "templateStatus": status.upper(),
        "templateName": template_name,
        "language": lang_norm,
        "canFreeText": inside,
        "canTemplate": (not inside) and (status.upper() == "APPROVED")
    }), 200

@app.get("/api/whatsapp/messages")
def whatsapp_messages():
    user_email = request.args.get("user_email")
    lead_id = request.args.get("lead_id")
    msgs, _ = _wa_thread_cached(user_email, lead_id)
    return jsonify({"messages": msgs}), 200

@app.get("/api/whatsapp/status")
def whatsapp_message_status():
    mid = request.args.get("message_id")
    if not mid:
        return jsonify({"error": "message_id is required"}), 400
    statuses = load_notifications().get("__wa_status__", {})
    return jsonify(statuses.get(mid) or {}), 200

@app.post("/api/whatsapp/optout")
def whatsapp_set_optout():
    data = request.get_json(force=True) or {}
    user_email = data.get("user_email")
    lead_id = data.get("lead_id")
    opt_out = bool(data.get("opt_out", True))
    if not user_email or not lead_id:
        return jsonify({"error": "user_email and lead_id required"}), 400
    leads_by_user = load_leads()
    arr = leads_by_user.get(user_email, []) or []
    for ld in arr:
        if str(ld.get("id")) == str(lead_id):
            ld["wa_opt_out"] = bool(opt_out)
    leads_by_user[user_email] = arr
    save_leads(leads_by_user)
    return jsonify({"ok": True, "opt_out": opt_out}), 200

@app.post("/api/whatsapp/send")
def whatsapp_send():
    """
    Inside 24h: free text (requires 'message') — sends exactly what user typed.
    Outside 24h: pick approved template locale (exact -> same primary -> any approved), else 409.
    """
    data = request.get_json(force=True) or {}
    def clean(v): 
        try: return str(v).strip() if v is not None else ""
        except Exception: return ""

    to_number       = clean(data.get("to") or data.get("phone"))
    raw_msg         = clean(data.get("message") or data.get("text"))
    user_email      = clean(data.get("user_email"))
    lead_id         = clean(data.get("lead_id"))
    template_name   = clean(data.get("template_name") or (os.getenv("WHATSAPP_TEMPLATE_DEFAULT") or ""))
    language_code   = clean(data.get("language_code") or (os.getenv("WHATSAPP_TEMPLATE_LANG") or "en"))

    # Components/params (optional)
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

    inside24 = wa_within_24h(user_email, lead_id)
    requested = wa_normalize_lang(language_code)
    primary   = wa_primary_lang(requested)
    to_norm   = wa_digits(to_number)
    waba_id   = wa_resolve_waba_id()

    try:
        if inside24:
            if not raw_msg:
                return jsonify({"ok": False, "error": "Message text required inside 24h"}), 400
            resp = wa_send_text(to_norm, raw_msg)
            mode = "free_text"; sent_text = raw_msg; used_lang = None
        else:
            if not template_name:
                return jsonify({"ok": False, "error": "Template name is required outside 24h.", "code": "TEMPLATE_REQUIRED_OUTSIDE_24H"}), 422
            r_list = wa_fetch_templates_raw()
            if not getattr(r_list, "ok", False):
                try: body = r_list.json()
                except Exception: body = {"raw": r_list.text}
                app.logger.error("[WA SEND] list_templates failed %s %s", getattr(r_list, "status_code", None), body)
                return jsonify({"ok": False, "error": "Failed to fetch templates from Graph.", "code": "GRAPH_LIST_TEMPLATES_FAILED",
                                "status": getattr(r_list, "status_code", None), "resp": body}), 502

            items = (r_list.json() or {}).get("data", [])
            locales = [{"language": wa_normalize_lang(t.get("language") or ""), "status": (t.get("status") or "").upper()}
                       for t in items if (t.get("name") or "") == template_name]

            if not locales:
                return jsonify({"ok": False, "error": f"Template '{template_name}' does not exist on this WABA.",
                                "code": "TEMPLATE_NAME_NOT_FOUND_ON_WABA", "template": template_name, "waba_id": waba_id}), 404

            exact = next((x for x in locales if x["language"] == requested and x["status"] == "APPROVED"), None)
            same_primary = next((x for x in locales if wa_primary_lang(x["language"]) == primary and x["status"] == "APPROVED"), None)
            any_approved = next((x for x in locales if x["status"] == "APPROVED"), None)

            if exact:
                used_lang = requested; reason = "exact"
            elif same_primary:
                used_lang = same_primary["language"]; reason = "fallback_same_primary"
            elif any_approved:
                used_lang = any_approved["language"]; reason = "fallback_any"
            else:
                return jsonify({"ok": False, "error": "Template is not approved in any locale; cannot send outside 24h window.",
                                "code": "TEMPLATE_NOT_APPROVED_ANY_LOCALE", "template": template_name,
                                "waba_id": waba_id, "requestedLanguage": requested, "availableLanguages": locales}), 409

            app.logger.info("[WA SEND] tpl=%s choose=%s reason=%s requested=%s", template_name, used_lang, reason, requested)
            resp = wa_send_template(to_norm, template_name, used_lang, params)
            sent_text = f"[template:{template_name}/{used_lang}] {raw_msg or ''}"
            mode = "template"

        try: result = resp.json()
        except Exception: result = {"raw": resp.text}

        if resp.status_code >= 400:
            err = {}
            try: err = result.get("error", {})
            except Exception: pass
            return jsonify({
                "ok": False, "mode": mode, "status": resp.status_code,
                "error": err.get("message") or "WhatsApp API error",
                "code": err.get("code") or "WA_ERROR",
                "details": (err.get("error_data") or {}),
                "waba_id": waba_id, "resp": result
            }), resp.status_code

        # message id & persist chat echo
        msg_id = None
        if isinstance(result, dict):
            arr = result.get("messages")
            if isinstance(arr, list) and arr:
                msg_id = arr[0].get("id")

        try:
            chats = load_chats()
            user_chats = (chats.get(user_email, {}) or {})
            arr = (user_chats.get(str(lead_id), []) or [])
            arr.append({"from": "user", "text": sent_text, "time": datetime.datetime.utcnow().isoformat() + "Z"})
            user_chats[str(lead_id)] = arr
            chats[user_email] = user_chats
            save_chats(chats)
            _WA_MSG_CACHE[(str(user_email or ""), str(lead_id or ""))] = {"at": datetime.datetime.utcnow(), "data": arr}

            # store status in notifications file under a dedicated key
            notes = load_notifications()
            wa_status = notes.get("__wa_status__", {})
            wa_status[msg_id or f"tmp-{uuid.uuid4().hex[:8]}"] = {
                "status": "sent_request", "user_email": user_email, "lead_id": str(lead_id),
                "to": to_norm, "mode": mode, "time": datetime.datetime.utcnow().isoformat() + "Z"
            }
            notes["__wa_status__"] = wa_status
            save_notifications(notes)
        except Exception as e:
            app.logger.warning("[WA] persist status error: %s", e)

        out = {"ok": True, "mode": mode, "status": resp.status_code, "message_id": msg_id,
               "requestedLanguage": requested, "usedLanguage": (used_lang if not inside24 else None),
               "waba_id": waba_id, "fallbackUsed": (not inside24 and used_lang != requested)}
        return jsonify(out), resp.status_code

    except RuntimeError as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    except pyrequests.RequestException as e:
        return jsonify({"ok": False, "error": f"Network error: {e}"}), 502

def _wa_verify_sig(raw_body: bytes, header_sig: str) -> bool:
    secret = os.getenv("APP_SECRET") or os.getenv("META_APP_SECRET")
    if not secret or not header_sig:
        return True
    try:
        import hmac, hashlib
        if not header_sig.startswith("sha256="): return False
        sent = header_sig.split("=", 1)[1]
        mac = hmac.new(secret.encode("utf-8"), msg=raw_body, digestmod=hashlib.sha256)
        return hmac.compare_digest(mac.hexdigest(), sent)
    except Exception:
        return False

@app.route("/api/whatsapp/webhook", methods=["GET", "POST"])
def whatsapp_webhook():
    if request.method == "GET":
        if request.args.get("hub.verify_token") == (os.getenv("WHATSAPP_VERIFY_TOKEN") or ""):
            return request.args.get("hub.challenge") or "Verified", 200
        return "Invalid verification token", 403

    raw = request.get_data()
    header_sig = request.headers.get("X-Hub-Signature-256")
    if not _wa_verify_sig(raw, header_sig):
        return "Signature mismatch", 403

    payload = request.get_json(silent=True) or {}
    try:
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})

                # delivery/read statuses
                for status in value.get("statuses", []):
                    notes = load_notifications()
                    wa_status = notes.get("__wa_status__", {})
                    wa_status[status.get("id") or "unknown"] = {
                        "status": status.get("status"),
                        "timestamp": status.get("timestamp"),
                        "recipient": status.get("recipient_id"),
                        "errors": status.get("errors")
                    }
                    notes["__wa_status__"] = wa_status
                    save_notifications(notes)

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

                    # opt-out / opt-in keywords
                    if sender_waid and isinstance(text, str):
                        up = text.strip().upper()
                        if up in ("STOP", "UNSUBSCRIBE", "STOP ALL", "CANCEL"):
                            wa = wa_digits(sender_waid)
                            data = load_leads()
                            changed = False
                            for _, leads in data.items():
                                for ld in leads:
                                    if wa_lead_matches(ld, wa):
                                        ld["wa_opt_out"] = True
                                        changed = True
                            if changed: save_leads(data)
                            try: wa_send_text(sender_waid, "You have been unsubscribed. Reply START to opt back in.")
                            except Exception: pass
                        elif up in ("START", "UNSTOP", "SUBSCRIBE"):
                            wa = wa_digits(sender_waid)
                            data = load_leads()
                            changed = False
                            for _, leads in data.items():
                                for ld in leads:
                                    if wa_lead_matches(ld, wa):
                                        ld["wa_opt_out"] = False
                                        changed = True
                            if changed: save_leads(data)
                            try: wa_send_text(sender_waid, "You are now opted back in. You can reply STOP anytime to opt out.")
                            except Exception: pass

                    # persist inbound to proper thread
                    user_email = wa_find_user_by_waid(sender_waid) if sender_waid else None
                    lead_id = wa_find_lead_id_by_waid(sender_waid) if sender_waid else None
                    chats = load_chats()
                    user_chats = (chats.get(user_email, {}) or {})
                    arr = (user_chats.get(str(lead_id), []) or [])
                    arr.append({"from": "lead", "text": text, "time": datetime.datetime.utcnow().isoformat() + "Z"})
                    user_chats[str(lead_id)] = arr
                    chats[user_email] = user_chats
                    save_chats(chats)
                    _WA_MSG_CACHE[(str(user_email or ""), str(lead_id or ""))] = {"at": datetime.datetime.utcnow(), "data": arr}

    except Exception as e:
        app.logger.warning("[WA WEBHOOK] parse error: %s", e)

    return "OK", 200

# -------------------------------------------------------------------
# AUTOMATIONS (Blueprint) — profile + flows + engine tick
# -------------------------------------------------------------------
automations_bp = Blueprint("automations", __name__)

def _now_utc() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)

def _read_json2(path: str, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def _write_json2(path: str, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)

FILE_AUTOMATIONS = os.path.join(DATA_ROOT, "automations.json")
FILE_STATE       = os.path.join(DATA_ROOT, "automations_state.json")
FILE_NOTIFICATIONS = os.path.join(DATA_ROOT, "notifications.json")  # same file used by core helpers

def _ensure_automations_files():
    if not os.path.exists(FILE_AUTOMATIONS):
        _write_json2(FILE_AUTOMATIONS, {"users": {}})
    if not os.path.exists(FILE_STATE):
        _write_json2(FILE_STATE, {})
    if not os.path.exists(FILE_NOTIFICATIONS):
        _write_json2(FILE_NOTIFICATIONS, {"notifications": []})

@automations_bp.before_request
def _auto_before():
    _ensure_automations_files()

@automations_bp.get("/health")
def automations_health():
    return jsonify({"ok": True, "message": "automations alive"})

def _load_user_profile(user_email: str):
    users = load_users()
    u = users.get((user_email or "").lower(), {}) or {}
    # expose only small subset needed for rendering
    return {
        "business_name": u.get("business") or u.get("businessName") or "",
        "booking_link": u.get("booking_link") or "",
        "quiet_hours_start": u.get("quiet_hours_start"),
        "quiet_hours_end": u.get("quiet_hours_end"),
    }

def _load_user_flows(user_email: str):
    db = _read_json2(FILE_AUTOMATIONS, {"users": {}})
    return db.get("users", {}).get((user_email or "").lower(), [])

def _save_user_flows(user_email: str, flows: list):
    db = _read_json2(FILE_AUTOMATIONS, {"users": {}})
    db.setdefault("users", {})[(user_email or "").lower()] = flows
    _write_json2(FILE_AUTOMATIONS, db)

def _load_state():
    return _read_json2(FILE_STATE, {})

def _save_state(state):
    _write_json2(FILE_STATE, state)

def _user_from_request():
    h = request.headers.get("X-User-Email")
    if h:
        return h.strip().lower()
    q = request.args.get("user") or (request.json.get("user") if request.is_json else None)
    return (q or "demo@retainai.ca").strip().lower()

def _can_send(run: dict, channel: str, hours: int) -> bool:
    last = (run.get("last_sent") or {}).get(channel)
    if not last:
        return True
    try:
        last_dt = datetime.datetime.fromisoformat(last)
    except Exception:
        return True
    return (_now_utc() - last_dt) >= datetime.timedelta(hours=hours)

def _mark_sent(run: dict, channel: str):
    run.setdefault("last_sent", {})[channel] = _now_utc().isoformat()

def _in_quiet_hours(now_utc: datetime.datetime, profile: dict) -> bool:
    qs = profile.get("quiet_hours_start")
    qe = profile.get("quiet_hours_end")
    if qs is None or qe is None:
        return False
    hour = now_utc.hour
    if qs > qe:
        return hour >= qs or hour < qe
    return qs <= hour < qe

@automations_bp.get("/templates")
def automations_templates():
    # Few curated templates (UI can clone and edit)
    templates = [
        {
            "id": "new-lead-nurture-3touch",
            "name": "New Lead Nurture (3-touch)",
            "enabled": False,
            "trigger": {"type": "new_lead", "within_hours": 24},
            "steps": [
                {"type": "send_whatsapp", "text": "Welcome! I’m from {{business_name}} — can I help you book? {{booking_link}}"},
                {"type": "wait", "hours": 24},
                {"type": "if_no_reply", "within_days": 2, "then": [
                    {"type": "send_email", "subject": "Welcome!", "html": "<p>Quick intro — here’s the booking link: <a href='{{booking_link}}'>Book now</a>.</p>"}
                ]},
                {"type": "wait", "hours": 48},
                {"type": "push_owner", "title": "Give them a quick call", "message": "New lead may need a call"}
            ],
            "caps": {"per_lead_per_day": 1, "respect_quiet_hours": True},
            "auto_stop_on_reply": True
        }
    ]
    return jsonify({"templates": templates})

@automations_bp.get("/")
def list_flows():
    user = _user_from_request()
    flows = _load_user_flows(user)
    for f in flows:
        f.setdefault("id", str(uuid.uuid4()))
    return jsonify({"flows": flows})

@automations_bp.post("/")
def create_flow():
    user = _user_from_request()
    body = request.get_json(force=True) or {}
    flow = body.get("flow", {})
    flow.setdefault("id", str(uuid.uuid4()))
    flow.setdefault("enabled", False)
    flow["owner"] = user
    flows = _load_user_flows(user)
    flows.append(flow)
    _save_user_flows(user, flows)
    return jsonify({"ok": True, "flow": flow})

@automations_bp.put("/<flow_id>")
def update_flow(flow_id):
    user = _user_from_request()
    body = request.get_json(force=True) or {}
    flows = _load_user_flows(user)
    for i, f in enumerate(flows):
        if f.get("id") == flow_id:
            merged = {**f, **(body.get("flow", {}))}
            merged["id"] = flow_id
            flows[i] = merged
            _save_user_flows(user, flows)
            return jsonify({"ok": True, "flow": merged})
    return jsonify({"ok": False, "error": "not_found"}), 404

@automations_bp.post("/enable/<flow_id>")
def enable_flow(flow_id):
    user = _user_from_request()
    body = request.get_json(force=True) or {}
    enabled = bool(body.get("enabled", True))
    flows = _load_user_flows(user)
    for i, f in enumerate(flows):
        if f.get("id") == flow_id:
            f["enabled"] = enabled
            _save_user_flows(user, flows)
            return jsonify({"ok": True, "flow": f})
    return jsonify({"ok": False, "error": "not_found"}), 404

@automations_bp.delete("/<flow_id>")
def delete_flow(flow_id):
    user = _user_from_request()
    flows = _load_user_flows(user)
    flows = [f for f in flows if f.get("id") != flow_id]
    _save_user_flows(user, flows)
    state = _load_state()
    if flow_id in state:
        state.pop(flow_id, None)
        _save_state(state)
    return jsonify({"ok": True})

# Minimal engine tick: today it just exists as a hook; real logic can be expanded safely
def engine_tick():
    # placeholder to avoid NameError in scheduler; expand with your actual automation logic if needed
    try:
        state = _load_state()
        state["_last_tick"] = _now_utc().isoformat()
        _save_state(state)
    except Exception as e:
        app.logger.warning("[ENGINE] tick error: %s", e)

# Register the blueprint once (avoid duplicate registration under gunicorn workers)
if "automations" not in app.blueprints:
    app.register_blueprint(automations_bp, url_prefix="/api/automations")

# -------------------------------------------------------------------
# Leads CRUD + Notes (endpoints named uniquely to avoid collisions)
# -------------------------------------------------------------------
@app.get('/api/leads/<user_email>')
def api_get_leads_v2(user_email):
    leads_by_user = load_leads()
    leads = leads_by_user.get(user_email, [])
    # compute status color by cadence
    users = load_users()
    user = users.get(user_email)
    business_type = (user.get("business", "") if user else "").lower()
    BUSINESS_TYPE_INTERVALS = {
        "salon": 14, "nail": 14, "spa": 14, "clinic": 7, "coaching": 10,
    }
    interval = BUSINESS_TYPE_INTERVALS.get(business_type, 14)
    now = datetime.datetime.utcnow()
    updated = []
    for lead in leads:
        last_contacted = lead.get("last_contacted") or lead.get("createdAt")
        try:
            last_dt = datetime.datetime.fromisoformat((last_contacted or "").replace("Z", ""))
            days_since = (now - last_dt).days
        except Exception:
            days_since = 0
        if days_since > interval + 2:
            status = "cold";   status_color = "#e66565"
        elif interval <= days_since <= interval + 2:
            status = "warning"; status_color = "#f7cb53"
        else:
            status = "active";  status_color = "#1bc982"
        lead["status"] = status
        lead["status_color"] = status_color
        lead["days_since_contact"] = days_since
        updated.append(lead)
    return jsonify({"leads": updated}), 200

@app.post('/api/leads/<user_email>')
def api_save_leads_v2(user_email):
    data = request.get_json(force=True) or {}

    # If the frontend sends an empty list on logout, DO NOT wipe storage.
    # Only allow replacing with empty when caller explicitly sets allow_empty=True.
    if "leads" not in data:
        return jsonify({"error": "Field 'leads' is required"}), 400

    leads = data.get("leads")
    if not isinstance(leads, list):
        return jsonify({"error": "Leads must be a list"}), 400

    if len(leads) == 0 and not bool(data.get("allow_empty", False)):
        # No-op: return what we currently have.
        current = load_leads().get(user_email, [])
        return jsonify({"message": "ignored empty save", "leads": current}), 200

    # Normal save path (replace with provided list)
    now = datetime.datetime.utcnow().isoformat() + "Z"
    leads_by_user = load_leads()

    # Normalize records so later PATCH calls (notes, tags, etc.) always find IDs.
    normalized = []
    for lead in leads:
        l = dict(lead or {})
        l.setdefault("id", str(uuid.uuid4()))
        l.setdefault("createdAt", now)
        l.setdefault("last_contacted", l.get("createdAt") or now)
        l.setdefault("name", l.get("name") or l.get("email") or "")
        l.setdefault("notes", l.get("notes", ""))
        l.setdefault("tags", l.get("tags", []))
        l.setdefault("owner", user_email)
        l.setdefault("wa_opt_out", bool(l.get("wa_opt_out", False)))
        normalized.append(l)

    leads_by_user[user_email] = normalized
    save_leads(leads_by_user)
    return jsonify({"message": "Leads updated", "leads": normalized}), 200

@app.delete('/api/leads/<user_email>/<lead_id>')
def api_delete_lead_v2(user_email, lead_id):
    leads_by_user = load_leads()
    arr = leads_by_user.get(user_email, []) or []
    new_arr = [ld for ld in arr if str(ld.get("id")) != str(lead_id)]
    if len(new_arr) == len(arr):
        return jsonify({"error": "Lead not found"}), 404
    leads_by_user[user_email] = new_arr
    save_leads(leads_by_user)
    return jsonify({"ok": True})

@app.post('/api/leads/<user_email>/add')
def api_add_lead_v2(user_email):
    data = request.get_json(force=True) or {}
    email = (data.get("email") or "").strip().lower()
    phone = (data.get("phone") or "").strip()
    name  = (data.get("name") or email.split("@")[0].replace(".", " ").title() if email else "").strip()
    if not (email or phone):
        return jsonify({"error": "Provide at least email or phone"}), 400
    leads_by_user = load_leads()
    arr = leads_by_user.get(user_email, []) or []
    # prevent duplicates by email
    for ld in arr:
        if email and (ld.get("email") or "").lower() == email:
            return jsonify({"error": "Lead already exists with this email"}), 409
    now = datetime.datetime.utcnow().isoformat() + "Z"
    lead = {
        "id": str(uuid.uuid4()),
        "email": email,
        "phone": phone,
        "name": name or (phone if phone else email),
        "owner": user_email,
        "createdAt": now,
        "last_contacted": now,
        "notes": data.get("notes", ""),
        "tags": data.get("tags", []),
        "wa_opt_out": False
    }
    arr.append(lead)
    leads_by_user[user_email] = arr
    save_leads(leads_by_user)
    return jsonify({"lead": lead}), 201

@app.put('/api/leads/<user_email>/<lead_id>')
def api_update_lead_v2(user_email, lead_id):
    data = request.get_json(force=True) or {}
    leads_by_user = load_leads()
    arr = leads_by_user.get(user_email, []) or []
    updated = None
    for i, ld in enumerate(arr):
        if str(ld.get("id")) == str(lead_id):
            merged = {**ld, **data}
            merged["id"] = ld.get("id")
            arr[i] = merged
            updated = merged
            break
    if not updated:
        return jsonify({"error": "Lead not found"}), 404
    leads_by_user[user_email] = arr
    save_leads(leads_by_user)
    return jsonify({"lead": updated}), 200

@app.post('/api/leads/<user_email>/<lead_id>/notes')
def api_update_lead_notes_v2(user_email, lead_id):
    data = request.get_json(force=True) or {}
    notes = str(data.get("notes", "")).strip()
    leads_by_user = load_leads()
    arr = leads_by_user.get(user_email, []) or []
    updated = None
    for i, ld in enumerate(arr):
        if str(ld.get("id")) == str(lead_id):
            ld["notes"] = notes
            arr[i] = ld
            updated = ld
            break
    if not updated:
        return jsonify({"error": "Lead not found"}), 404
    leads_by_user[user_email] = arr
    save_leads(leads_by_user)
    return jsonify({"lead": updated}), 200

@app.post('/api/leads/<user_email>/<lead_id>/contacted')
def api_mark_contacted_v2(user_email, lead_id):
    leads_by_user = load_leads()
    arr = leads_by_user.get(user_email, []) or []
    updated = False
    for lead in arr:
        if str(lead.get("id")) == str(lead_id):
            lead["last_contacted"] = datetime.datetime.utcnow().isoformat() + "Z"
            updated = True
            break
    if updated:
        leads_by_user[user_email] = arr
        save_leads(leads_by_user)
        return jsonify({"message": "Lead marked as contacted.", "lead_id": lead_id}), 200
    return jsonify({"error": "Lead not found."}), 404

# -------------------------------------------------------------------
# Notifications (safe read/write)
# -------------------------------------------------------------------
@app.get('/api/notifications/<user_email>')
def api_get_notifications_v2(user_email):
    notes = load_notifications().get(user_email, [])
    for n in notes:
        n.setdefault('read', False)
    return jsonify({"notifications": notes}), 200

@app.post('/api/notifications/<user_email>/<int:idx>/mark_read')
def api_mark_notification_read_v2(user_email, idx):
    all_notes = load_notifications()
    user_notes = all_notes.get(user_email)
    if not user_notes or idx < 0 or idx >= len(user_notes):
        return jsonify({"error": "Notification not found"}), 404
    user_notes[idx]['read'] = True
    all_notes[user_email] = user_notes
    save_notifications(all_notes)
    return ('', 204)

# -------------------------------------------------------------------
# VAPID (stubbed/disabled unless you wire pywebpush)
# -------------------------------------------------------------------
@app.get('/api/vapid-public-key')
def api_vapid_key_v2():
    return jsonify({'publicKey': os.getenv("VAPID_PUBLIC_KEY", "")})

@app.post('/api/save-subscription')
def api_save_subscription_v2():
    data = request.get_json(force=True) or {}
    email = data.get('email')
    subscription = data.get('subscription')
    if not email or not subscription:
        return jsonify({'error': 'Email and subscription required'}), 400
    # Persist alongside notifications file for simplicity
    notes = load_notifications()
    subs = notes.get("__push_subscriptions__", {})
    subs[email] = subscription
    notes["__push_subscriptions__"] = subs
    save_notifications(notes)
    return jsonify({'message': 'Subscription saved'}), 200

# -------------------------------------------------------------------
# Home
# -------------------------------------------------------------------
@app.get("/")
def home_root():
    return jsonify({"status": "RetainAI backend running."})

# -------------------------------------------------------------------
# Scheduler — start once per worker; safe under gunicorn
# -------------------------------------------------------------------
def start_scheduler_once():
    """Start APScheduler once per process."""
    if getattr(app, "_scheduler_started", False):
        return
    if os.getenv("DISABLE_SCHEDULER") == "1":
        app._scheduler_started = True
        return
    try:
        from flask_apscheduler import APScheduler
        scheduler = APScheduler()
        scheduler.init_app(app)
        scheduler.start()

        # Engine tick every minute
        try:
            scheduler.add_job(
                id="engine_tick",
                func=engine_tick,
                trigger="interval",
                minutes=1,
                replace_existing=True,
            )
        except Exception as e:
            app.logger.warning("[SCHEDULER] engine_tick not scheduled: %s", e)

        # Optional jobs if present in globals
        for job_id, fn_name, trigger_kwargs in [
            ("lead_reminder_job", "check_for_lead_reminders", {"trigger": "interval", "minutes": 1}),
            ("birthday_greetings_job", "send_birthday_greetings", {"trigger": "cron", "hour": 8}),
            ("trial_ending_soon_job", "send_trial_ending_soon", {"trigger": "cron", "hour": 9}),
        ]:
            fn = globals().get(fn_name)
            if fn:
                try:
                    scheduler.add_job(id=job_id, func=fn, replace_existing=True, **trigger_kwargs)
                except Exception as e:
                    app.logger.warning("[SCHEDULER] %s not scheduled: %s", job_id, e)

        app._scheduler_started = True
        app.logger.info("[SCHEDULER] started")
    except Exception as e:
        app.logger.warning("[SCHEDULER] failed to start: %s", e)
        app._scheduler_started = True  # prevent retry loop

# right after: app = Flask(__name__)
app.config.setdefault("SCHEDULER_API_ENABLED", False)

# --- place this once, near the bottom of app.py, but ABOVE the __main__ guard ---
try:
    start_scheduler_once()
except Exception as e:
    # This will NOT raise, just logs if something goes wrong at import-time
    app.logger.warning("[SCHEDULER] failed to start at import: %s", e)

# -------------------------------------------------------------------
# Local dev runner ONLY
# -------------------------------------------------------------------
if __name__ == "__main__":
    debug = os.getenv("FLASK_ENV") != "production"
    port = int(os.getenv("PORT", "5000"))
    host = os.getenv("HOST", "0.0.0.0")
    start_scheduler_once()
    app.run(host=host, port=port, debug=debug, threaded=True)
