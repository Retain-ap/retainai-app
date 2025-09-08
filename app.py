# RetainAI — app.py (consolidated, production-ready)
# ================================================
# Fixes applied:
# - Single DATA_DIR root (prevents “disappearing leads”).
# - Atomic JSON writes; no partial truncation.
# - CORS initialized once after app creation.
# - WhatsApp helper collisions removed (one authoritative set).
# - Automations blueprint mounted once under /api/automations.
# - Scheduler safe-start (only once).
# - Minor hardening & logging.

from __future__ import annotations

import os
import json
import re
import hmac
import hashlib
import datetime
from datetime import datetime as dt, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse, urlencode, quote, quote_plus

import requests as pyrequests
import stripe
from flask import Flask, request, jsonify, send_from_directory, redirect, Blueprint
from flask_cors import CORS
from dotenv import load_dotenv
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email
from flask_apscheduler import APScheduler

# Optional Google (OAuth / Calendar)
try:
    from google.oauth2 import id_token
    from google.auth.transport import requests as grequests
except Exception:  # keep app booting even if google libs missing
    id_token = None
    grequests = None

# ----------------------------
# Environment
# ----------------------------
if os.getenv("FLASK_ENV") != "production":
    load_dotenv()

# ----------------------------
# Flask + CORS (single init)
# ----------------------------
app = Flask(__name__)
FRONTEND_URL = (os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")
CORS(app, resources={r"/api/*": {"origins": [FRONTEND_URL, "http://localhost:3000", "http://127.0.0.1:3000", "https://app.retainai.ca", "https://retainai.ca"]}}, supports_credentials=True)
app.logger.info("[BOOT] RetainAI backend starting…")

# ----------------------------
# Persistent storage root
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
ICS_DIR            = os.path.join(DATA_DIR, "ics_files")
os.makedirs(ICS_DIR, exist_ok=True)

# Automations engine aux
FILE_AUTOMATIONS   = os.path.join(DATA_DIR, "automations.json")
FILE_STATE         = os.path.join(DATA_DIR, "automation_state.json")
FILE_NOTIFICATIONS = os.path.join(DATA_DIR, "engine_notifications.json")
FILE_USERS         = os.path.join(DATA_DIR, "users_profiles.json")

# ----------------------------
# Third-party / env config
# ----------------------------
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
SENDGRID_API_KEY   = os.getenv("SENDGRID_API_KEY")
SENDER_EMAIL       = os.getenv("SENDER_EMAIL", "noreply@retainai.ca")

# Stripe
STRIPE_SECRET_KEY         = os.getenv("STRIPE_SECRET_KEY")
STRIPE_PRICE_ID           = os.getenv("STRIPE_PRICE_ID")
STRIPE_WEBHOOK_SECRET     = os.getenv("STRIPE_WEBHOOK_SECRET")
STRIPE_CONNECT_CLIENT_ID  = os.getenv("STRIPE_CONNECT_CLIENT_ID")
STRIPE_REDIRECT_URI       = os.getenv("STRIPE_REDIRECT_URI")
stripe.api_key = STRIPE_SECRET_KEY

# WhatsApp Cloud API
WHATSAPP_TOKEN            = os.getenv("WHATSAPP_TOKEN") or os.getenv("WHATSAPP_ACCESS_TOKEN")
WHATSAPP_PHONE_ID         = os.getenv("WHATSAPP_PHONE_ID") or os.getenv("WHATSAPP_PHONE_NUMBER_ID")
WHATSAPP_VERIFY_TOKEN     = os.getenv("WHATSAPP_VERIFY_TOKEN", "retainai-verify")
WHATSAPP_WABA_ID          = os.getenv("WHATSAPP_WABA_ID") or os.getenv("WHATSAPP_BUSINESS_ID")
WHATSAPP_TEMPLATE_DEFAULT = os.getenv("WHATSAPP_TEMPLATE_DEFAULT", "")
WHATSAPP_TEMPLATE_LANG    = os.getenv("WHATSAPP_TEMPLATE_LANG", "en_US")
META_APP_SECRET           = os.getenv("APP_SECRET") or os.getenv("META_APP_SECRET")
DEFAULT_COUNTRY_CODE      = (os.getenv("DEFAULT_COUNTRY_CODE") or "1").strip()
WHATSAPP_API_VERSION      = os.getenv("WHATSAPP_API_VERSION", "v20.0")

# Google OAuth (optional)
GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI  = os.getenv("GOOGLE_REDIRECT_URI")
GOOGLE_SCOPES        = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar",
]

# Misc
SUBSCRIPTIONS: Dict[str, Any] = {}
CHANNEL_EMAIL = "email"
CHANNEL_WHATSAPP = "whatsapp"
ZERO_DECIMAL = {"bif","clp","djf","gnf","jpy","kmf","krw","mga","pyg","rwf","ugx","vnd","vuv","xaf","xof","xpf"}

# SendGrid templates (keep your mappings)
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
    "nail salon": 5,
    "real estate": 14,
    "law firm": 30,
    "dentist": 7,
    "coaching": 30,
    "consulting": 21,
    "spa": 10,
    "accounting": 30,
}

# ----------------------------
# Health
# ----------------------------
@app.get("/healthz")
def healthz():
    return "ok", 200

# ----------------------------
# JSON helpers (atomic)
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

# ----------------------------
# Email helpers
# ----------------------------
def send_email_with_template(to_email, template_id, dynamic_data, subject=None, from_email=None, reply_to_email=None):
    if not SENDGRID_API_KEY:
        app.logger.warning("[SENDGRID] Missing API key; skipping send (simulated).")
        return True
    from_email = from_email or SENDER_EMAIL
    subject = subject or (dynamic_data or {}).get("subject") or "Message"
    msg = Mail(from_email=from_email, to_emails=to_email, subject=subject)
    msg.template_id = template_id
    msg.dynamic_template_data = dict(dynamic_data or {})
    if reply_to_email:
        msg.reply_to = Email(reply_to_email)
    try:
        resp = SendGridAPIClient(SENDGRID_API_KEY).send(msg)
        app.logger.info("[SENDGRID] %s to=%s subj=%s", resp.status_code, to_email, subject)
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

def send_birthday_email(lead_email, lead_name, business_name):
    send_email_with_template(
        to_email=lead_email,
        template_id=SG_TEMPLATE_BIRTHDAY,
        dynamic_data={"lead_name": lead_name, "business_name": business_name},
    )

def send_birthday_reminder_to_user(user_email, user_name, lead_name, business_name, birthday):
    send_email_with_template(
        to_email=user_email,
        template_id=SG_TEMPLATE_BDAY_REMINDER_USER,
        dynamic_data={
            "user_name": user_name,
            "lead_name": lead_name,
            "business_name": business_name,
            "birthday": birthday,
        },
        subject=f"Birthday Reminder: {lead_name}'s birthday is tomorrow!",
        from_email="reminder@retainai.ca",
    )

def send_trial_ending_email(user_email, user_name, business_name, trial_end_date):
    send_email_with_template(
        to_email=user_email,
        template_id=SG_TEMPLATE_TRIAL_ENDING,
        dynamic_data={
            "user_name": user_name,
            "business_name": business_name,
            "trial_end_date": trial_end_date,
        },
    )

# ----------------------------
# ICS helpers
# ----------------------------
def create_ics_file(appt):
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

def make_google_calendar_link(appt):
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

# ----------------------------
# Notifications & Scheduler jobs
# ----------------------------
def log_notification(user_email, subject, message, lead_email=None):
    notes = load_notifications()
    notes.setdefault(user_email, []).append({
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "subject": subject,
        "message": message,
        "lead_email": lead_email,
        "read": False,
    })
    save_notifications(notes)

def send_warning_summary_email(user_email, warning_leads, interval):
    if not warning_leads:
        return
    users = load_users()
    user = users.get(user_email, {})
    user_name = user.get("name") or user_email.split("@")[0].title()

    def fmt(d): 
        try: return (d or "").split("T")[0]
        except: return d or "-"

    items = []
    for lead in warning_leads:
        items.append(
            f"<li style='margin-bottom:12px'>"
            f"<b>{lead.get('name','-')}</b><br>"
            f"Email: {lead.get('email','-')}<br>"
            f"Last Contacted: {fmt(lead.get('last_contacted') or lead.get('createdAt'))} "
            f"({lead.get('days_since_contact','?')} days ago)"
            f"</li>"
        )
    lead_list_html = "<ul>" + "".join(items) + "</ul>"

    dynamic = {
        "user_name": user_name,
        "lead_list": lead_list_html,
        "crm_link": f"{FRONTEND_URL}/app/dashboard",
        "year": datetime.datetime.now().year,
        "interval": interval,
        "count": len(warning_leads),
    }
    send_email_with_template(
        to_email=user_email,
        template_id=SG_TEMPLATE_FOLLOWUP_USER,
        dynamic_data=dynamic,
        subject="Leads needing follow-up",
        from_email=SENDER_EMAIL,
    )

def check_for_lead_reminders():
    app.logger.info("[Scheduler] scanning leads for follow-up")
    leads_by_user = load_leads()
    users_by_email = load_users()
    now = datetime.datetime.utcnow()
    for user_email, leads in (leads_by_user or {}).items():
        user = users_by_email.get(user_email, {})
        business_type = (user.get("business", "") or "").lower()
        interval = BUSINESS_TYPE_INTERVALS.get(business_type, 14)
        warning = []
        for lead in leads:
            last = lead.get("last_contacted") or lead.get("createdAt")
            if not last: 
                continue
            try:
                last_dt = datetime.datetime.fromisoformat(last.replace("Z", ""))
                days = (now - last_dt).days
            except Exception:
                days = 0
            if interval <= days <= interval + 2:
                lead["days_since_contact"] = days
                warning.append(lead)
        if warning:
            try:
                send_warning_summary_email(user_email, warning, interval)
                log_notification(user_email, "Leads needing follow-up", f"{len(warning)} leads require follow-up")
            except Exception as e:
                app.logger.warning("[WARN] follow-up notifier error: %s", e)

def send_birthday_greetings():
    leads_by_user = load_leads()
    users_by_email = load_users()
    today = datetime.datetime.utcnow().strftime("%m-%d")
    tomorrow = (datetime.datetime.utcnow() + datetime.timedelta(days=1)).strftime("%m-%d")
    for user_email, leads in (leads_by_user or {}).items():
        user = users_by_email.get(user_email, {})
        business = user.get("business", "")
        user_name = user.get("name", "")
        for lead in leads:
            bday = (lead.get("birthday") or "")
            parts = bday.split("-")
            if len(parts) >= 3:
                mmdd = "-".join(parts[1:3])
                if mmdd == today:
                    send_birthday_email(lead.get("email",""), lead.get("name",""), business)
                    log_notification(user_email, f"Birthday email sent to {lead.get('name','')}", "Automated birthday email", lead.get("email"))
                if mmdd == tomorrow:
                    send_birthday_reminder_to_user(user_email, user_name, lead.get("name",""), business, bday)
                    log_notification(user_email, f"Reminder: {lead.get('name','')}'s birthday is tomorrow!", "Reminder sent", lead.get("email"))

def send_trial_ending_soon():
    users = load_users()
    now = datetime.datetime.utcnow()
    changed = False
    for email, user in (users or {}).items():
        ts = user.get("trial_start")
        if not ts or user.get("status") not in ("pending_payment", "active"):
            continue
        try:
            start = datetime.datetime.fromisoformat(ts)
        except Exception:
            continue
        end = start + datetime.timedelta(days=14)
        if (end - now).days == 2 and not user.get("trial_ending_notice_sent"):
            send_trial_ending_email(email, user.get("name",""), user.get("business",""), end.strftime("%B %d, %Y"))
            user["trial_ending_notice_sent"] = True
            changed = True
    if changed:
        save_users(users)

# ----------------------------
# Appointments API
# ----------------------------
@app.route('/api/appointments/<user_email>', methods=['GET'])
def get_appointments(user_email):
    data = load_appointments()
    return jsonify({"appointments": data.get(user_email, [])}), 200

@app.route('/api/appointments/<user_email>', methods=['POST'])
def create_appointment(user_email):
    data = request.json or {}
    appt = {
        "id": os.urandom(8).hex(),
        "lead_email": data['lead_email'],
        "lead_first_name": data['lead_first_name'],
        "user_name": data['user_name'],
        "user_email": data['user_email'],
        "business_name": data['business_name'],
        "appointment_time": data['appointment_time'],
        "appointment_location": data['appointment_location'],
        "duration": int(data.get('duration', 30)),
        "notes": data.get('notes', ""),
    }
    appointments = load_appointments()
    appointments.setdefault(user_email, []).append(appt)
    save_appointments(appointments)
    create_ics_file(appt)

    # email confirmation
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
    return jsonify({"message": "Appointment created and confirmation sent!", "appointment": appt}), 201

@app.route('/api/appointments/<user_email>/<appt_id>', methods=['PUT'])
def update_appointment(user_email, appt_id):
    data = request.json or {}
    appointments = load_appointments()
    arr = appointments.get(user_email, [])
    updated = None
    for i, ap in enumerate(arr):
        if ap['id'] == appt_id:
            ap.update(data)
            arr[i] = ap
            updated = ap
            create_ics_file(ap)
            break
    appointments[user_email] = arr
    save_appointments(appointments)
    return jsonify({"updated": bool(updated), "appointment": updated}), 200

@app.route('/api/appointments/<user_email>/<appt_id>', methods=['DELETE'])
def delete_appointment(user_email, appt_id):
    appointments = load_appointments()
    arr = appointments.get(user_email, [])
    before = len(arr)
    arr = [a for a in arr if a['id'] != appt_id]
    appointments[user_email] = arr
    save_appointments(appointments)
    f = os.path.join(ICS_DIR, f"{appt_id}.ics")
    if os.path.exists(f):
        os.remove(f)
    return jsonify({"deleted": before - len(arr)}), 200

# ----------------------------
# Stripe Connect / Billing
# ----------------------------
def to_minor(amount, currency):
    c = (currency or "usd").lower()
    return int(round(float(amount) * (1 if c in ZERO_DECIMAL else 100)))

def from_minor(value, currency):
    c = (currency or "usd").lower()
    d = 1 if c in ZERO_DECIMAL else 100.0
    return (value or 0) / d

def get_connected_acct(user_email: str):
    users = load_users()
    return (users.get(user_email, {}) or {}).get("stripe_account_id")

def serialize_invoice(inv):
    currency = inv.currency
    amount_total = from_minor(getattr(inv, "total", None) or inv.amount_due, currency)
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

@app.route("/api/stripe/connect-url", methods=["GET"])
def get_stripe_connect_url():
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
        account=acct.id, refresh_url=refresh_url, return_url=return_url, type="account_onboarding"
    )
    return jsonify({"url": link.url}), 200

@app.route("/api/stripe/oauth/connect", methods=["GET"])
def stripe_oauth_connect():
    user_email = request.args.get("user_email")
    if not user_email:
        return jsonify({"error": "Missing user_email"}), 400
    params = {
        "response_type": "code",
        "client_id": STRIPE_CONNECT_CLIENT_ID,
        "scope": "read_write",
        "redirect_uri": STRIPE_REDIRECT_URI or "",
        "state": user_email,
    }
    url = "https://connect.stripe.com/oauth/authorize?" + urlencode(params)
    return jsonify({"url": url}), 200

@app.route("/api/stripe/dashboard-link", methods=["GET"])
def stripe_dashboard_link():
    user_email = request.args.get("user_email")
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
    error      = request.args.get("error")
    error_desc = request.args.get("error_description", "")
    user_email = request.args.get("state")
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
    user_email = request.args.get("user_email")
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

@app.route('/api/stripe/invoice', methods=['POST'])
def create_stripe_invoice():
    data = request.json or {}
    user_email     = data.get("user_email")
    customer_name  = data.get("customer_name")
    customer_email = data.get("customer_email")
    amount         = data.get("amount")
    description    = data.get("description")
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
    user_email = request.args.get("user_email")
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
    payload = request.data
    sig_header = request.headers.get('stripe-signature')
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
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
# =========================
# Auth & Google OAuth
# =========================
@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json or {}
    email        = (data.get('email') or '').strip().lower()
    password     = (data.get('password') or '').strip()
    businessType = (data.get('businessType') or '')
    businessName = (data.get('businessName') or businessType or '')
    name         = (data.get('name') or '')
    teamSize     = (data.get('teamSize') or '')
    logo         = (data.get('logo') or '')
    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400
    users = load_users()
    if email in users:
        return jsonify({'error': 'User already exists'}), 409
    trial_start = datetime.datetime.utcnow().isoformat()
    users[email] = {
        'password':                password,
        'businessType':            businessType,
        'business':                businessName,
        'name':                    name,
        'teamSize':                teamSize,
        'picture':                 logo,
        'status':                  'pending_payment',
        'trial_start':             trial_start,
        'trial_ending_notice_sent': False,
    }
    save_users(users)

    # Best-effort welcome email
    try:
        send_welcome_email(email, name, businessName)
    except Exception as e:
        app.logger.warning("[WELCOME EMAIL] %s", e)

    # Stripe Checkout Session
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
    data     = request.json or {}
    email    = (data.get('email') or '').strip().lower()
    password = (data.get('password') or '').strip()
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
            'stripe_connected':  user.get('stripe_connected', False),
        }
    }), 200

@app.route('/api/oauth/google', methods=['POST'])
def google_oauth():
    if not id_token or not grequests:
        return jsonify({'error': 'Google libraries unavailable on server'}), 501
    data = request.json or {}
    token = data.get('credential')
    if not token:
        return jsonify({'error': 'No Google token provided'}), 400
    try:
        idinfo = id_token.verify_oauth2_token(token, grequests.Request(), GOOGLE_CLIENT_ID)
        email   = idinfo['email'].lower()
        name    = idinfo.get('name', '') or ''
        picture = idinfo.get('picture', '') or ''
        users = load_users()
        user  = users.get(email)
        if not user:
            users[email] = {
                'password': None,
                'businessType': '',
                'business': '',
                'name': name,
                'picture': picture,
                'people': '',
                'trial_start': datetime.datetime.utcnow().isoformat(),
                'status': 'pending_payment',
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
    data         = request.json or {}
    email        = (data.get('email') or '').strip().lower()
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
    email = (request.args.get("user_email") or "").strip().lower()
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
    state = request.args.get("state")
    if error:
        return f"Google OAuth error: {error}", 400
    if not code or not state:
        return "Missing code or state", 400
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
    if not resp.ok:
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
        f"{quote(calendar_id)}/events"
        f"?timeMin={now}&timeMax={max_time}&singleEvents=true&orderBy=startTime"
    )
    resp = pyrequests.get(url, headers={"Authorization": f"Bearer {access_token}"})
    if not resp.ok:
        return jsonify({"error": resp.text}), 500
    return jsonify(resp.json())

# ============================================================
# WhatsApp Cloud API — 24h window, templates, webhook, etc.
# ============================================================
# caches
_WA_TEMPLATE_CACHE: Dict[tuple, Dict[str, Any]] = {}
_WA_TEMPLATE_TTL_SECONDS = 300
_MSG_CACHE: Dict[tuple, Dict[str, Any]] = {}
_MSG_CACHE_TTL_SECONDS = 2
_WABA_RES = {"id": None, "checked_at": None}
_WABA_TTL_SECONDS = 300

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

def _norm_wa(num: str) -> str:
    d = re.sub(r"\D", "", num or "")
    if len(d) == 10 and DEFAULT_COUNTRY_CODE.isdigit():
        d = DEFAULT_COUNTRY_CODE + d
    return d

def _wa_env():
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_ID:
        raise RuntimeError("WhatsApp credentials missing")
    return WHATSAPP_TOKEN, WHATSAPP_PHONE_ID

def _lead_matches_wa(lead, wa_digits):
    for key in ("whatsapp", "phone"):
        if _norm_wa(lead.get(key)) == wa_digits:
            return True
    return False

def find_user_by_whatsapp(wa_id):
    wa = _norm_wa(wa_id)
    leads_by_user = load_leads()
    for user_email, leads in (leads_by_user or {}).items():
        for lead in leads:
            if _lead_matches_wa(lead, wa):
                return user_email
    return None

def find_lead_by_whatsapp(wa_id):
    wa = _norm_wa(wa_id)
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
    user_email = request.args.get("user_email", "")
    lead_id    = request.args.get("lead_id", "")
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
    user_email = request.args.get("user_email")
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
    user_email = data.get("user_email")
    lead_id = data.get("lead_id")
    opt_out = bool(data.get("opt_out", True))
    if not user_email or not lead_id:
        return jsonify({"error": "user_email and lead_id required"}), 400
    leads = load_leads()
    arr = leads.get(user_email, []) or []
    for ld in arr:
        if str(ld.get("id")) == str(lead_id):
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
    user_email      = clean(data.get("user_email"))
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
            arr.append({"from": "user", "text": sent_text, "time": dt.utcnow().isoformat() + "Z"})
            user_chats[lead_id] = arr; chats[user_email] = user_chats; save_chats(chats)
            if msg_id:
                statuses = load_statuses()
                statuses[msg_id] = {"status": "sent_request", "user_email": user_email, "lead_id": lead_id,
                                    "to": to_number, "mode": mode, "time": dt.utcnow().isoformat() + "Z"}
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
                    arr.append({"from": "lead", "text": text, "time": dt.utcnow().isoformat() + "Z"})
                    user_chats[lead_id] = arr
                    chats[user_email] = user_chats
                    save_chats(chats)
                    _MSG_CACHE[(str(user_email or ""), str(lead_id or ""))] = {"at": dt.utcnow(), "data": arr}

    except Exception as e:
        app.logger.warning("[WHATSAPP WEBHOOK] parse error: %s", e)

    return "OK", 200

# ----------------------------
# AI helpers (reply drafts)
# ----------------------------
@app.post("/api/ai-prompt")
def ai_prompt():
    try:
        data = request.get_json(force=True) or {}
    except Exception:
        data = {}
    user_email = (data.get("user_email") or "").strip().lower()
    lead_id    = str(data.get("lead_id") or "").strip()
    if not user_email or not lead_id:
        return jsonify({"error": "user_email and lead_id are required"}), 400

    users = load_users()
    leads_by_user = load_leads()
    chats_by_user = load_chats()

    user = users.get(user_email, {}) or {}
    user_name = (user.get("name") or "").strip()
    business  = (user.get("business") or user.get("businessType") or "business").strip()

    lead = None
    for ld in (leads_by_user.get(user_email, []) or []):
        if str(ld.get("id")) == lead_id:
            lead = ld
            break

    lead_name = (lead.get("name") if lead else "") or ""
    lead_tags = ", ".join((lead or {}).get("tags", []))
    lead_notes = (lead or {}).get("notes", "") or "-"

    last_inbound = ""
    thread = (chats_by_user.get(user_email, {}) or {}).get(lead_id, []) or []
    for m in reversed(thread):
        if m.get("from") == "lead":
            t = m.get("text")
            if isinstance(t, str) and t.strip():
                last_inbound = t.strip()
                break

    if not OPENROUTER_API_KEY:
        return jsonify({"error": "OPENROUTER_API_KEY is not configured"}), 500

    sys_msg = "You are a CRM messaging assistant. Output only the message body (no greetings or signatures)."
    user_msg = (
        f"You are a professional, emotionally intelligent assistant for a {business} business. "
        f"Write ONLY a direct, warm reply that could be sent in chat. "
        f"Do NOT include greeting lines or sign-offs.\n\n"
        f"Lead Name: {lead_name}\n"
        f"Tags: {lead_tags}\n"
        f"Notes: {lead_notes}\n"
        f"Most recent message from the lead: \"{last_inbound}\"\n"
        f"Reply as if you were {user_name or 'the business owner'} at {business}."
    )

    try:
        r = pyrequests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "openai/gpt-4o",
                "messages": [
                    {"role": "system", "content": sys_msg},
                    {"role": "user", "content": user_msg},
                ],
                "max_tokens": 220,
                "temperature": 0.7,
            },
            timeout=30,
        )
        j = r.json() if r.ok else {}
        prompt = (
            (j.get("choices") or [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )
        if not prompt:
            return jsonify({"error": j.get("error", {}).get("message", "AI response was empty")}), 502

        import re as _re
        def _clean(t: str) -> str:
            s = str(t or "")
            s = _re.sub(r"^(Subject|Lead Name|Recipient)\s*:\s*.*\n?", "", s, flags=_re.I | _re.M)
            s = _re.sub(r"^\s*[\w ]+:\s*$", "", s, flags=_re.M)
            s = _re.sub(r"^\s*\n+", "", s)
            return s.strip()

        return jsonify({"prompt": _clean(prompt)}), 200

    except Exception as e:
        app.logger.warning(f"[AI PROMPT ERROR] {e}")
        return jsonify({"error": "Failed to get AI response"}), 502

@app.post('/api/send-ai-message')
def send_ai_message():
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

@app.post('/api/generate-message')
def generate_message():
    data = request.json or {}
    lead = data.get("lead", {}) or {}
    last_message = data.get("last_message", "")
    user_business = data.get("user_business", "business")
    lead_name = lead.get('name', '')
    user_name = data.get("user_name", "")
    prompt = (
        f"You are a professional, emotionally intelligent assistant for a {user_business} business. "
        f"Given the context below, write ONLY a direct, warm, natural message that could be sent in chat or email, with no greeting lines, subjects, or sign-offs. Only output the message body.\n\n"
        f"Lead Name: {lead_name}\n"
        f"Tags: {', '.join(lead.get('tags', []))}\n"
        f"Notes: {lead.get('notes', '-')}\n"
        f"Most recent message from the lead: \"{last_message}\"\n"
        "Your reply should be concise, helpful, and conversational. Do NOT include subject lines, greetings, or closings. Reply as if you were the business owner responding to the client."
    )
    try:
        resp = pyrequests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "openai/gpt-4o",
                "messages": [
                    {"role": "system", "content": "You are a CRM messaging assistant. Output only the message body."},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 200,
                "temperature": 0.7
            },
            timeout=30
        )
        result = resp.json()
        if "choices" in result and result["choices"]:
            reply = result["choices"][0]["message"]["content"].strip()
            return jsonify({"reply": reply}), 200
        return jsonify({"error": result.get("error", {}).get("message", "AI response was incomplete.")}), 500
    except Exception as ex:
        app.logger.error("AI Request Error: %s", str(ex))
        return jsonify({"error": "Failed to get AI response"}), 500

@app.post('/api/generate_prompt')
def generate_prompt():
    data = request.get_json(force=True) or {}

    user_email = (data.get("userEmail") or data.get("user_email") or "").strip().lower()
    users = load_users()
    rec = users.get(user_email, {}) if user_email else {}

    business_name = (
        (rec.get("business") or "").strip()
        or (data.get("business") or "").strip()
        or (data.get("businessName") or "").strip()
        or (data.get("lineOfBusiness") or "").strip()
        or "Your Business"
    )
    business_type = (rec.get("businessType") or data.get("businessType") or "").strip()

    user_name   = (rec.get("name") or data.get("name") or data.get("userName")
                   or (user_email.split("@")[0].title() if user_email else "Your Team"))
    lead_name   = (data.get("leadName") or "").strip()
    tags        = (data.get("tags") or "").strip()
    notes       = (data.get("notes") or "").strip()
    prompt_type = (data.get("promptType") or "").strip()
    instruction = (data.get("instruction") or "").strip()

    sys_msg = "Output only the message body. No subjects, greetings, or signatures."
    user_msg = (
        f"You write concise, friendly CRM messages on behalf of the business named '{business_name}'. "
        f"Never refer to the business generically (e.g., 'the {business_type or 'business'}'); "
        f"always use the exact name '{business_name}'. Keep it under ~80 words.\n\n"
        f"Recipient: {lead_name}\n"
        f"Tags: {tags}\n"
        f"Notes: {notes}\n"
        f"Prompt Type: {prompt_type}\n"
        f"Instruction: {instruction}\n"
        f"Sender Name: {user_name}\n"
        f"Business Name: {business_name}\n"
    )

    try:
        r = pyrequests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "openai/gpt-4o",
                "messages": [
                    {"role": "system", "content": sys_msg},
                    {"role": "user", "content": user_msg},
                ],
                "max_tokens": 220,
                "temperature": 0.7,
            },
            timeout=30
        )
        j = r.json() if r.ok else {}
        txt = (j.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""
        txt = txt.strip()
        if not txt:
            return jsonify({"error": j.get("error", {}).get("message", "AI response was incomplete.")}), 500

        import re
        txt = re.sub(r'(?im)^\s*subject\s*:\s*.*$', '', txt).strip().strip('"').strip("'")

        if business_type:
            bt = re.escape(business_type)
            bn = business_name
            txt = re.sub(rf'(?i)\bfrom\s*{bt}s?\b', f'from {bn}', txt)
            txt = re.sub(rf'(?i)\b(?:the|our|your|this|that)\s*{bt}s?\b', bn, txt)
            txt = re.sub(rf'(?i)\b{bt}s?\b', bn, txt)
            txt = re.sub(r'\s{2,}', ' ', txt).strip()

        return jsonify({"prompt": txt}), 200

    except Exception as ex:
        app.logger.error("AI Request Error: %s", str(ex))
        return jsonify({"error": "Failed to get AI response"}), 500
# =================================================================
# AUTOMATIONS (INLINE) — Blueprint + Engine
# =================================================================

# ---------- Channels ----------
CHANNEL_EMAIL = "email"
CHANNEL_WHATSAPP = "whatsapp"

# ---------- Utilities ----------
def _now_utc() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)

def _read_json2(path: str, default: Any):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def _write_json2(path: str, data: Any):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)

def _ensure_files2():
    if not os.path.exists(FILE_AUTOMATIONS):
        _write_json2(FILE_AUTOMATIONS, {"users": {}})
    if not os.path.exists(FILE_STATE):
        _write_json2(FILE_STATE, {})
    if not os.path.exists(FILE_NOTIFICATIONS):
        _write_json2(FILE_NOTIFICATIONS, {"notifications": []})
    if not os.path.exists(FILE_USERS):
        _write_json2(FILE_USERS, {"users": {}})

# ---------- Notifications ----------
def _create_notification(owner_email: str, title: str, body: str):
    data = _read_json2(FILE_NOTIFICATIONS, {"notifications": []})
    notif = {
        "id": str(uuid.uuid4()),
        "owner": (owner_email or "").lower(),
        "title": title,
        "body": body,
        "created_at": _now_utc().isoformat()
    }
    data.setdefault("notifications", []).insert(0, notif)
    _write_json2(FILE_NOTIFICATIONS, data)

# ---------- User Profiles ----------
def _load_user_profile(user_email: str) -> Dict[str, Any]:
    db = _read_json2(FILE_USERS, {"users": {}})
    return db.get("users", {}).get((user_email or "").lower(), {})

def _save_user_profile(user_email: str, profile: Dict[str, Any]):
    db = _read_json2(FILE_USERS, {"users": {}})
    db.setdefault("users", {})[(user_email or "").lower()] = profile
    _write_json2(FILE_USERS, db)

# ---------- Automations storage ----------
def _load_user_flows(user_email: str) -> List[Dict[str, Any]]:
    db = _read_json2(FILE_AUTOMATIONS, {"users": {}})
    return db.get("users", {}).get((user_email or "").lower(), [])

def _save_user_flows(user_email: str, flows: List[Dict[str, Any]]):
    db = _read_json2(FILE_AUTOMATIONS, {"users": {}})
    db.setdefault("users", {})[(user_email or "").lower()] = flows
    _write_json2(FILE_AUTOMATIONS, db)

def _load_state() -> Dict[str, Any]:
    return _read_json2(FILE_STATE, {})

def _save_state(state: Dict[str, Any]):
    _write_json2(FILE_STATE, state)

# ---------- Request helper ----------
def _user_from_request() -> str:
    h = request.headers.get("X-User-Email")
    if h:
        return h.strip().lower()
    q = request.args.get("user") or (request.json.get("user") if request.is_json else None)
    return (q or "demo@retainai.ca").strip().lower()

# ---------- Time helpers ----------
def _dt(s: Optional[str]) -> Optional[datetime.datetime]:
    try:
        return datetime.datetime.fromisoformat(s) if s else None
    except Exception:
        return None

def _is_valid_url(u: str) -> bool:
    try:
        p = urlparse(u)
        return p.scheme in ("http", "https") and bool(p.netloc)
    except Exception:
        return False

def _in_quiet_hours(now_utc: datetime.datetime, profile: Dict[str, Any]) -> bool:
    qs = profile.get("quiet_hours_start")
    qe = profile.get("quiet_hours_end")
    if qs is None or qe is None:
        return False
    hour = now_utc.hour
    if qs > qe:
        return hour >= qs or hour < qe
    else:
        return qs <= hour < qe

# ---------- Triggers & Conditions ----------
from datetime import timedelta as _td

def trig_no_reply(lead: Dict[str, Any], days: int) -> bool:
    last_inbound = _dt(lead.get("last_inbound_at"))
    last_outbound = _dt(lead.get("last_outbound_at"))
    last_any = _dt(lead.get("last_activity_at")) or last_inbound or last_outbound
    if not last_any:
        created = _dt(lead.get("createdAt")) or _dt(lead.get("created_at")) or (_now_utc() - _td(days=999))
        return _now_utc() - created >= _td(days=days)
    if last_inbound and (_now_utc() - last_inbound < _td(days=days)):
        return False
    return _now_utc() - last_any >= _td(days=days)

def trig_new_lead(lead: Dict[str, Any], within_hours: int = 24) -> bool:
    created = _dt(lead.get("createdAt")) or _dt(lead.get("created_at"))
    return bool(created and (_now_utc() - created <= _td(hours=within_hours)))

def trig_no_show(lead: Dict[str, Any]) -> bool:
    for appt in (lead.get("appointments") or []):
        if str(appt.get("status") or "").lower().replace("_", "-") == "no-show" and not appt.get("automation_seen_no_show"):
            return True
    return False

def cond_no_reply_since(lead: Dict[str, Any], days: int) -> bool:
    last_inbound = _dt(lead.get("last_inbound_at"))
    return not last_inbound or (_now_utc() - last_inbound >= _td(days=days))

def cond_no_booking_since(lead: Dict[str, Any], days: int = 2) -> bool:
    for appt in (lead.get("appointments") or []):
        if str(appt.get("status") or "").lower() in ("booked", "scheduled", "confirmed"):
            upd = _dt(appt.get("updated_at"))
            if upd and (_now_utc() - upd < _td(days=days)):
                return False
    return True

# ---------- Token rendering ----------
MISSING = "⛔"

def _render_text(tmpl: str, lead: Dict[str, Any], run: Dict[str, Any], profile: Dict[str, Any]) -> str:
    if not isinstance(tmpl, str):
        return tmpl
    business_name = profile.get("business_name") or f"{MISSING} add your business name in Automations > Settings"
    booking_link = profile.get("booking_link") or f"{MISSING} add your booking link in Automations > Settings"
    out = tmpl
    out = out.replace("{{business_name}}", business_name)
    out = out.replace("{{booking_link}}", booking_link)
    out = out.replace("{{lead.first_name}}", str(lead.get("first_name") or lead.get("name") or ""))
    out = out.replace("{{lead.full_name}}", str(lead.get("name") or ""))
    out = out.replace("{{last_ai_text}}", (run.get("memo", {}).get("last_ai_text") or ""))
    return out

def _contains_blockers(text: str) -> bool:
    return MISSING in (text or "")

# ---------- External channel actions ----------
def send_email_sendgrid_auto(to_email: str, subject: str, html: str, business_name: str) -> bool:
    if not SENDGRID_API_KEY:
        app.logger.info("[Automations] SENDGRID_API_KEY missing; simulate email ok.")
        return True
    try:
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        msg = Mail(
            from_email=Email(SENDER_EMAIL, business_name or "RetainAI"),
            to_emails=to_email,
            subject=subject,
            html_content=html,
        )
        resp = sg.send(msg)
        app.logger.info("[Automations] SendGrid status: %s", resp.status_code)
        return 200 <= resp.status_code < 300
    except Exception as e:
        app.logger.error("[Automations] SendGrid error: %s", e)
        return False

def ai_draft_message(context: Dict[str, Any]) -> str:
    business_name = context.get("business_name") or f"{MISSING} add your business name in Automations > Settings"
    booking = context.get("booking_link") or f"{MISSING} add your booking link in Automations > Settings"
    lead_name = (context.get("lead", {}).get("first_name") or context.get("lead", {}).get("name") or "there")
    if not OPENROUTER_API_KEY:
        return f"Hey {lead_name}, just checking in — want to grab a spot with {business_name}? Book here: {booking}."
    try:
        prompt = (
            "Write a short, friendly follow-up message (<= 45 words).\n"
            f"Business: {business_name}.\n"
            f"Booking link: {booking}.\n"
            f"Lead context: {json.dumps(context.get('lead', {}))}.\n"
            "Tone: warm, human, no emojis, 1 sentence if possible."
        )
        r = pyrequests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "openrouter/auto",
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.7,
            },
            timeout=25,
        )
        data = r.json()
        txt = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return (txt or f"Quick check-in — want to grab a spot with {business_name}? {booking}").strip()
    except Exception as e:
        app.logger.error("[Automations] AI draft error: %s", e)
        return f"Quick check-in — want to grab a spot with {business_name}? {booking}"

# ---------- WhatsApp helpers consumed by the engine ----------
def _append_chat_message(user_email: str, lead_id: str, text: str):
    try:
        chats = load_chats()
        user_chats = (chats.get(user_email, {}) or {})
        lid = str(lead_id or "")
        arr = (user_chats.get(lid, []) or [])
        arr.append({"from": "user", "text": text, "time": _now_utc().isoformat().replace("+00:00", "") + "Z"})
        user_chats[lid] = arr
        chats[user_email] = user_chats
        save_chats(chats)
        try:
            _MSG_CACHE[(str(user_email or ""), str(lead_id or ""))] = {"at": datetime.datetime.utcnow(), "data": arr}
        except Exception:
            pass
    except Exception as e:
        app.logger.error("[Automations] append_chat_message error: %s", e)

def _choose_wa_template(preferred_name: str | None, preferred_lang: str | None):
    name = (preferred_name or os.getenv("WHATSAPP_TEMPLATE_DEFAULT", "")).strip()
    if not name:
        return None, None, 0

    waba_id = _resolve_waba_id()
    r_list = _fetch_templates_for_waba(waba_id)
    items = (r_list.json() or {}).get("data", []) if getattr(r_list, "ok", False) else []

    def _normalize_lang(s: str) -> str:
        return (s or "").strip().replace("-", "_").lower()

    def _primary_lang(s: str) -> str:
        s = _normalize_lang(s)
        return s.split("_", 1)[0] if s else ""

    requested = _normalize_lang(preferred_lang or os.getenv("WHATSAPP_TEMPLATE_LANG", "en"))
    primary = _primary_lang(requested)

    locales = []
    for t in items:
        if (t.get("name") or "") == name:
            locales.append({"language": _normalize_lang(t.get("language") or ""), "status": (t.get("status") or "").upper()})

    used_lang = requested
    exact = next((x for x in locales if x["language"] == requested and x["status"] == "APPROVED"), None)
    if not exact:
        same_primary = next((x for x in locales if _primary_lang(x["language"]) == primary and x["status"] == "APPROVED"), None)
        any_appr = next((x for x in locales if x["status"] == "APPROVED"), None)
        used_lang = (same_primary or any_appr or {"language": requested})["language"]

    # BODY param count
    body_param_count = 0
    try:
        for t in items:
            if (t.get("name") == name) and (_normalize_lang(t.get("language") or "") == used_lang):
                comps = t.get("components") or []
                body = next((c for c in comps if (c.get("type") or "").upper() == "BODY"), {})
                params_list = body.get("parameters") or body.get("example", {}).get("body_text") or []
                if isinstance(params_list, list):
                    if params_list and isinstance(params_list[0], list):
                        body_param_count = max((len(x) for x in params_list), default=0)
                    else:
                        body_param_count = len(params_list)
                break
    except Exception as e:
        app.logger.warning("[Automations] template components fetch error: %s", e)

    return name, used_lang, int(body_param_count or 0)

def _build_wa_params(count: int, lead: dict, profile: dict, run: dict, rendered_text: str | None):
    vals = []
    first = lead.get("first_name") or (lead.get("name") or "").split(" ")[0]
    if first: vals.append(first)
    if profile.get("business_name"): vals.append(profile["business_name"])
    if profile.get("booking_link"):  vals.append(profile["booking_link"])
    if rendered_text: vals.append(rendered_text)
    vals = (vals + [""] * count)[:count]
    return vals

def _send_whatsapp_with_window(flow, step, lead, run, caps, profile) -> bool:
    if caps.get("respect_quiet_hours", True) and _in_quiet_hours(_now_utc(), profile):
        return False
    per_hours = int(caps.get("per_lead_per_day", 1)) * 24
    if not _can_send(run, CHANNEL_WHATSAPP, per_hours=per_hours):
        return False

    user_email = (lead.get("owner") or flow.get("owner") or "").lower()
    lead_id = str(lead.get("id") or lead.get("email") or lead.get("phone") or "")
    to = lead.get("phone") or lead.get("whatsapp")
    if not to or bool(lead.get("wa_opt_out")):
        return True

    raw = step.get("text") or run.get("memo", {}).get("last_ai_text") or ""
    body = _render_text(raw, lead, run, profile)
    if _contains_blockers(body):
        _create_notification(user_email, "Setup needed",
                             "WhatsApp message blocked: missing profile values (booking link / business name).")
        return True

    inside24 = False
    try:
        inside24 = within_24h(user_email, lead_id)
    except Exception:
        pass

    if inside24:
        try:
            resp = send_wa_text(to, body)
            ok = getattr(resp, "status_code", 500) < 400
        except Exception as e:
            app.logger.error("[Automations] WA free-text send error: %s", e)
            ok = False
        if ok:
            _mark_sent(run, CHANNEL_WHATSAPP)
            _append_chat_message(user_email, lead_id, body)
        return True

    tpl_name, used_lang, pcount = _choose_wa_template(step.get("template_name"), os.getenv("WHATSAPP_TEMPLATE_LANG", "en"))
    if not tpl_name or not used_lang:
        _create_notification(user_email, "WhatsApp template unavailable",
                             "No approved template/locale available to send outside the 24h window.")
        return True

    params = _build_wa_params(pcount, lead, profile, run, body)
    shown = f"[template:{tpl_name}/{used_lang}] {body}"
    try:
        resp = send_wa_template(to, tpl_name, used_lang, params)
        ok = getattr(resp, "status_code", 500) < 400
    except Exception as e:
        app.logger.error("[Automations] WA template send error: %s", e)
        ok = False
    if ok:
        _mark_sent(run, CHANNEL_WHATSAPP)
        _append_chat_message(user_email, lead_id, shown)
    return True

# ---------- Engine bits ----------
def _get_run(state: Dict[str, Any], flow_id: str, lead_key: str) -> Dict[str, Any]:
    return state.setdefault(flow_id, {}).setdefault(lead_key, {
        "step": 0,
        "created_at": _now_utc().isoformat(),
        "last_step_at": None,
        "done": False,
        "last_sent": {},
        "memo": {}
    })

def _advance(run: Dict[str, Any]):
    run["step"] = int(run.get("step", 0)) + 1
    run["last_step_at"] = _now_utc().isoformat()

def _trigger_met(trigger: Dict[str, Any], lead: Dict[str, Any]) -> bool:
    t = trigger.get("type")
    if t == "no_reply":
        return trig_no_reply(lead, int(trigger.get("days", 3)))
    if t == "new_lead":
        return trig_new_lead(lead, int(trigger.get("within_hours", 24)))
    if t == "appointment_no_show":
        return trig_no_show(lead)
    return False

def _should_auto_stop(flow: Dict[str, Any], lead: Dict[str, Any], run: Dict[str, Any]) -> bool:
    if flow.get("auto_stop_on_reply", True):
        last_inbound = _dt(lead.get("last_inbound_at"))
        if last_inbound and last_inbound > _dt(run.get("created_at")):
            return True
    return False

def _can_send(run: Dict[str, Any], channel: str, per_hours: int) -> bool:
    last = (run.get("last_sent") or {}).get(channel)
    if not last:
        return True
    try:
        last_dt = datetime.datetime.fromisoformat(last)
    except Exception:
        return True
    return (_now_utc() - last_dt) >= _td(hours=per_hours)

def _mark_sent(run: Dict[str, Any], channel: str):
    run.setdefault("last_sent", {})[channel] = _now_utc().isoformat()

def _execute_step(flow: Dict[str, Any], step: Dict[str, Any], lead: Dict[str, Any], run: Dict[str, Any], caps: Dict[str, Any], profile: Dict[str, Any]) -> bool:
    kind = step.get("type")

    if kind == "wait":
        last = _dt(run.get("last_step_at")) or _dt(run.get("created_at")) or _now_utc()
        delta = _td(days=step.get("days", 0), hours=step.get("hours", 0), minutes=step.get("minutes", 0))
        return _now_utc() - last >= delta

    if kind == "if_no_reply":
        within_days = int(step.get("within_days", 2))
        if cond_no_reply_since(lead, within_days):
            for s in (step.get("then") or []):
                _execute_step(flow, s, lead, run, caps, profile)
            return True
        return True

    if kind == "if_no_booking":
        within_days = int(step.get("within_days", 2))
        if cond_no_booking_since(lead, within_days):
            for s in (step.get("then") or []):
                _execute_step(flow, s, lead, run, caps, profile)
            return True
        return True

    if kind == "ai_draft":
        text = ai_draft_message({
            "lead": lead,
            "flow": flow,
            "business_name": profile.get("business_name"),
            "booking_link": profile.get("booking_link"),
        })
        run.setdefault("memo", {})["last_ai_text"] = text
        return True

    if kind == "send_whatsapp":
        return _send_whatsapp_with_window(flow, step, lead, run, caps, profile)

    if kind == "send_email":
        if caps.get("respect_quiet_hours", True) and _in_quiet_hours(_now_utc(), profile):
            return False
        per_hours = int(caps.get("per_lead_per_day", 1)) * 24
        if not _can_send(run, CHANNEL_EMAIL, per_hours=per_hours):
            return False
        email = lead.get("email")
        if not email:
            return True
        subject = _render_text(step.get("subject") or "Quick check-in", lead, run, profile)
        html = _render_text(step.get("html") or "<p>Hi {{lead.first_name}}, just checking in. <a href='{{booking_link}}'>Book here</a>.</p>", lead, run, profile)
        if _contains_blockers(subject) or _contains_blockers(html):
            _create_notification(lead.get("owner") or flow.get("owner") or "", "Setup needed", "Email blocked: missing profile values (booking link / business name).")
            return True
        ok = send_email_sendgrid_auto(email, subject, html, profile.get("business_name") or "RetainAI")
        if ok:
            _mark_sent(run, CHANNEL_EMAIL)
        return True

    if kind == "push_owner":
        owner = lead.get("owner") or flow.get("owner") or ""
        if owner:
            _create_notification(owner, step.get("title") or "Lead to call", step.get("message") or str(lead.get("email")))
        return True

    if kind == "add_tag":
        tag = step.get("tag")
        if tag:
            tags = set((lead.get("tags") or []))
            tags.add(tag)
            lead["tags"] = sorted(list(tags))
            owner = (lead.get("owner") or flow.get("owner") or "").lower()
            if owner:
                leads_by_user = load_leads()
                arr = leads_by_user.get(owner, []) or []
                for i, ld in enumerate(arr):
                    if (ld.get("id") == lead.get("id")) or (ld.get("email") == lead.get("email")):
                        arr[i] = lead
                        break
                leads_by_user[owner] = arr
                save_leads(leads_by_user)
        return True

    return True

def engine_tick():
    flows_db = _read_json2(FILE_AUTOMATIONS, {"users": {}})
    state = _load_state()
    leads_by_user = load_leads()

    for user, flows in flows_db.get("users", {}).items():
        profile = _load_user_profile(user)
        user_leads = leads_by_user.get(user, []) or []

        for flow in flows:
            if not flow.get("enabled", False):
                continue
            flow_id = flow.get("id") or str(uuid.uuid4())
            steps = flow.get("steps", [])
            caps = flow.get("caps", {"per_lead_per_day": 1, "respect_quiet_hours": True})
            trigger = flow.get("trigger", {})

            for lead in user_leads:
                owner = (lead.get("owner") or user or "").lower()
                if owner != user:
                    continue

                lead_key = str(lead.get("id") or lead.get("email") or lead.get("phone") or uuid.uuid4())
                run = _get_run(state, flow_id, lead_key)
                if run.get("done"):
                    continue

                if run.get("step", 0) == 0:
                    if not _trigger_met(trigger, lead):
                        state.setdefault(flow_id, {}).pop(lead_key, None)
                        continue

                if _should_auto_stop(flow, lead, run):
                    run["done"] = True
                    continue

                step_index = int(run.get("step", 0))
                if step_index >= len(steps):
                    run["done"] = True
                    continue

                step = steps[step_index]
                progressed = _execute_step(flow, step, lead, run, caps, profile)
                if progressed:
                    _advance(run)

    _save_state(state)

# ---------- API (Blueprint) ----------
automations_bp = Blueprint("automations", __name__)

@automations_bp.before_request
def _bf_ensure_files():
    _ensure_files2()

@automations_bp.get("/health")
def automations_health():
    return jsonify({"ok": True, "message": "automations alive"})

@automations_bp.get("/user/profile")
def get_user_profile():
    user = _user_from_request()
    prof = _load_user_profile(user)
    return jsonify({
        "profile": {
            "business_name": prof.get("business_name", ""),
            "booking_link": prof.get("booking_link", ""),
            "quiet_hours_start": prof.get("quiet_hours_start"),
            "quiet_hours_end": prof.get("quiet_hours_end"),
        }
    })

def _vp_int(v, name):
    if v is None:
        return None
    try:
        iv = int(v)
        if 0 <= iv <= 23:
            return iv
    except Exception:
        pass
    raise ValueError(f"{name} must be an integer 0-23")

def _vp_url(u):
    if u is None or u == "":
        return None
    if _is_valid_url(u):
        return u
    raise ValueError("booking_link must be http(s) URL")

@automations_bp.post("/user/profile")
def set_user_profile():
    user = _user_from_request()
    body = request.get_json(force=True) or {}
    prof = _load_user_profile(user)
    try:
        if "business_name" in body:
            bn = str(body.get("business_name") or "").strip()
            prof["business_name"] = bn[:120]
        if "booking_link" in body:
            prof["booking_link"] = _vp_url(body.get("booking_link"))
        if "quiet_hours_start" in body:
            prof["quiet_hours_start"] = _vp_int(body.get("quiet_hours_start"), "quiet_hours_start")
        if "quiet_hours_end" in body:
            prof["quiet_hours_end"] = _vp_int(body.get("quiet_hours_end"), "quiet_hours_end")
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    _save_user_profile(user, prof)
    return jsonify({"ok": True, "profile": prof})

def _builtin_templates() -> List[Dict[str, Any]]:
    return [
        {
            "id": "cold-recovery-7d",
            "name": "Cold Lead Recovery (7-day)",
            "enabled": False,
            "trigger": {"type": "no_reply", "days": 3},
            "steps": [
                {"type": "ai_draft"},
                {"type": "send_whatsapp", "text": "{{last_ai_text}}"},
                {"type": "wait", "days": 2},
                {"type": "if_no_reply", "within_days": 2, "then": [
                    {"type": "send_email", "subject": "We still here?", "html": "<p>Quick check-in — want to grab a spot with {{business_name}}? <a href='{{booking_link}}'>Book here</a>.</p>"}
                ]}
            ],
            "caps": {"per_lead_per_day": 1, "respect_quiet_hours": True},
            "auto_stop_on_reply": True
        },
        {
            "id": "no-show-winback",
            "name": "No-Show Winback",
            "enabled": False,
            "trigger": {"type": "appointment_no_show"},
            "steps": [
                {"type": "send_whatsapp", "text": "Sorry we missed you — here’s 10% off to rebook: {{booking_link}}"},
                {"type": "wait", "hours": 48},
                {"type": "if_no_booking", "within_days": 2, "then": [
                    {"type": "send_email", "subject": "Ready to rebook?", "html": "<p>We saved you a spot — <a href='{{booking_link}}'>rebook here</a>.</p>"},
                    {"type": "add_tag", "tag": "Needs Attention"}
                ]}
            ],
            "caps": {"per_lead_per_day": 1, "respect_quiet_hours": True},
            "auto_stop_on_reply": True
        },
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

@automations_bp.get("/templates")
def automations_templates():
    return jsonify({"templates": _builtin_templates()})

@automations_bp.get("/wa/templates")
def list_wa_templates():
    waba_id = _resolve_waba_id()
    r = _fetch_templates_for_waba(waba_id)
    if not getattr(r, "ok", False):
        return jsonify({"ok": False, "templates": [], "error": "unavailable"}), 503
    data = r.json() or {}
    items = data.get("data", []) or []
    approved = [t for t in items if (t.get("status") or "").upper() == "APPROVED"]
    approved.sort(key=lambda x: f"{x.get('name','')}-{x.get('language','')}".lower())
    return jsonify({"ok": True, "templates": approved})

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

@automations_bp.post("/test")
def automations_test():
    """
    Accepts:
      mode: "dryrun" | "execute"
      flow_id (string) OR flow (full flow object)
      lead_email (string)
      profile (dict) optional override
      ignore_waits / ignore_quiet_hours / bypass_rate_limits (bool) for execute
    """
    data = request.get_json(silent=True) or {}
    user = _user_from_request()
    flow_id = str(data.get("flow_id") or "").strip()
    flow = data.get("flow") if isinstance(data.get("flow"), dict) else None
    lead_email = (data.get("lead_email") or "").strip()
    mode = (data.get("mode") or "dryrun").strip().lower()

    # Resolve flow
    if not flow and flow_id:
        for f in _load_user_flows(user):
            if str(f.get("id")) == flow_id:
                flow = f
                break
    if not flow and flow_id:
        for t in _builtin_templates():
            if str(t.get("id")) == flow_id:
                flow = {**t, "owner": user, "enabled": False}
                break
    if not flow:
        return jsonify(ok=False, error="flow_not_found"), 404

    # Profile (stored + override)
    profile = _load_user_profile(user) or {}
    if isinstance(data.get("profile"), dict):
        profile = {**profile, **data["profile"]}

    # Helpers
    def _first_name_from_email(email: str) -> str:
        if not email:
            return ""
        local = email.split("@", 1)[0]
        return local.replace(".", " ").replace("_", " ").title()

    def _plaintext_to_html(s: str) -> str:
        import html as _html
        if not isinstance(s, str):
            s = "" if s is None else str(s)
        s = s.replace("\r\n", "\n")
        blocks = [p.strip() for p in s.split("\n\n")]
        parts = []
        for p in blocks:
            if not p:
                continue
            esc = _html.escape(p).replace("\n", "<br>")
            parts.append("<p>" + esc + "</p>")
        return "".join(parts)

    # ---------- DRY-RUN ----------
    if mode == "dryrun":
        def _subst(s: str) -> str:
            s = s or ""
            return (
                s.replace("{{business_name}}", profile.get("business_name", ""))
                 .replace("{{booking_link}}", profile.get("booking_link", ""))
                 .replace("{{lead.first_name}}", _first_name_from_email(lead_email))
                 .replace("{{last_ai_text}}", "(AI draft here)")
            )

        would = []
        for s in (flow.get("steps") or []):
            t = s.get("type")
            if t == "ai_draft":
                would.append({"type": "ai_draft"})
            elif t == "send_whatsapp":
                info = {"to": lead_email, "text": _subst(s.get("text"))}
                if s.get("template"):
                    info["template"] = s["template"]
                if s.get("template_name"):
                    info.setdefault("template", {})["name"] = s["template_name"]
                would.append({"type": "send_whatsapp", "info": info})
            elif t == "send_email":
                subj = _subst(s.get("subject"))
                if s.get("html"):
                    html_body = _subst(s.get("html"))
                else:
                    body_plain = _subst(s.get("body") or "")
                    html_body = _plaintext_to_html(body_plain)
                would.append({"type": "send_email", "info": {"to": lead_email, "subject": subj, "html": html_body}})
            elif t == "wait":
                would.append({"type": "wait", "info": {
                    "days": s.get("days"), "hours": s.get("hours"), "minutes": s.get("minutes")
                }})
            elif t in ("if_no_reply", "if_no_booking"):
                would.append({"type": t, "info": {"within_days": s.get("within_days", 2)}})
                for sub in (s.get("then") or []):
                    tt = sub.get("type")
                    if tt == "wait":
                        would.append({"type": f"{t}→wait", "info": {
                            "days": sub.get("days"), "hours": sub.get("hours"), "minutes": sub.get("minutes")
                        }})
                    else:
                        info = {
                            "to": lead_email,
                            "subject": _subst(sub.get("subject")),
                            "text": _subst(sub.get("text")),
                            "html": _subst(sub.get("html") or _plaintext_to_html(sub.get("body") or "")),
                            "tag": _subst(sub.get("tag")),
                        }
                        if sub.get("template"):
                            info["template"] = sub["template"]
                        if sub.get("template_name"):
                            info.setdefault("template", {})["name"] = sub["template_name"]
                        would.append({"type": f"{t}→{tt}", "info": info})
            elif t == "push_owner":
                would.append({"type": "push_owner", "info": {"title": _subst(s.get("title")), "message": _subst(s.get("message"))}})
            elif t == "add_tag":
                would.append({"type": "add_tag", "info": {"tag": _subst(s.get("tag"))}})
            else:
                would.append({"type": t or "unknown"})
        return jsonify(ok=True, profile=profile, would=would)

    # ---------- EXECUTE NOW ----------
    leads_by_user = load_leads()
    lead = None
    for ld in (leads_by_user.get(user, []) or []):
        if (ld.get("email") or "").strip().lower() == lead_email.lower():
            lead = dict(ld)
            break
    if not lead:
        lead = {
            "id": f"test-{uuid.uuid4().hex[:8]}",
            "email": lead_email,
            "name": _first_name_from_email(lead_email),
            "owner": user,
        }

    run = {
        "_ignore_waits": bool(data.get("ignore_waits", True)),
        "_ignore_quiet_hours": bool(data.get("ignore_quiet_hours", True)),
        "_bypass_rate_limits": bool(data.get("bypass_rate_limits", True)),
        "_collector": [],
        "created_at": _now_utc().isoformat(),
        "step": 0,
        "memo": {},
        "last_sent": {},
    }
    caps = flow.get("caps", {"per_lead_per_day": 1, "respect_quiet_hours": True})
    def _collector() -> list: return run.setdefault("_collector", [])

    def _exec_send_email(step):
        if caps.get("respect_quiet_hours", True) and not run.get("_ignore_quiet_hours", False):
            if _in_quiet_hours(_now_utc(), profile):
                _collector().append({"type": "send_email", "status": "skipped", "info": {"reason": "quiet_hours"}})
                return
        if not run.get("_bypass_rate_limits", False):
            if not _can_send(run, CHANNEL_EMAIL, per_hours=int(caps.get("per_lead_per_day", 1)) * 24):
                _collector().append({"type": "send_email", "status": "skipped", "info": {"reason": "rate_limit"}})
                return

        to_email = lead.get("email")
        if not to_email:
            _collector().append({"type": "send_email", "status": "skipped", "info": {"reason": "no_email"}})
            return

        subject = _render_text(step.get("subject") or "Quick check-in", lead, run, profile)
        if step.get("html"):
            html_body = _render_text(step.get("html") or "", lead, run, profile)
        else:
            body_plain = _render_text(step.get("body") or "", lead, run, profile)
            html_body = _plaintext_to_html(body_plain or "Hi {{lead.first_name}},\n\nJust checking in.\n\n{{business_name}}")

        if _contains_blockers(subject) or _contains_blockers(html_body):
            _create_notification(lead.get("owner") or flow.get("owner") or "", "Setup needed",
                                 "Email blocked: missing profile values (booking link / business name).")
            _collector().append({"type": "send_email", "status": "skipped", "info": {"reason": "missing_profile"}})
            return

        ok = send_email_sendgrid_auto(to_email, subject, html_body, profile.get("business_name") or "RetainAI")
        if ok:
            _mark_sent(run, CHANNEL_EMAIL)
            _collector().append({"type": "send_email", "status": "ok", "info": {"to": to_email, "subject": subject, "html": html_body}})
        else:
            _collector().append({"type": "send_email", "status": "error", "info": {"to": to_email, "subject": subject}})

    def _exec_send_whatsapp(step):
        if caps.get("respect_quiet_hours", True) and not run.get("_ignore_quiet_hours", False):
            if _in_quiet_hours(_now_utc(), profile):
                _collector().append({"type": "send_whatsapp", "status": "skipped", "info": {"reason": "quiet_hours"}})
                return
        if not run.get("_bypass_rate_limits", False):
            if not _can_send(run, CHANNEL_WHATSAPP, per_hours=int(caps.get("per_lead_per_day", 1)) * 24):
                _collector().append({"type": "send_whatsapp", "status": "skipped", "info": {"reason": "rate_limit"}})
                return

        to = lead.get("phone") or lead.get("whatsapp")
        if not to:
            _collector().append({"type": "send_whatsapp", "status": "skipped", "info": {"reason": "no_whatsapp"}})
            return
        if bool(lead.get("wa_opt_out")):
            _collector().append({"type": "send_whatsapp", "status": "skipped", "info": {"reason": "opt_out"}})
            return

        raw = step.get("text") or run.get("memo", {}).get("last_ai_text") or ""
        body_text = _render_text(raw, lead, run, profile)
        if _contains_blockers(body_text):
            _create_notification(lead.get("owner") or flow.get("owner") or "", "Setup needed",
                                 "WhatsApp message blocked: missing profile values (booking link / business name).")
            _collector().append({"type": "send_whatsapp", "status": "skipped", "info": {"reason": "missing_profile"}})
            return

        inside24 = False
        try:
            inside24 = within_24h(user, str(lead.get("id") or lead.get("email") or lead.get("phone") or ""))
        except Exception:
            pass

        if inside24:
            try:
                resp = send_wa_text(to, body_text)
                ok = getattr(resp, "status_code", 500) < 400
            except Exception as e:
                app.logger.error("[Automations] WA free-text send error: %s", e)
                ok = False
            if ok:
                _mark_sent(run, CHANNEL_WHATSAPP)
                _append_chat_message(user, str(lead.get("id") or lead.get("email") or lead.get("phone") or ""), body_text)
                _collector().append({"type": "send_whatsapp", "status": "ok", "info": {"to": to, "mode": "text", "text": body_text}})
            else:
                _collector().append({"type": "send_whatsapp", "status": "error", "info": {"to": to, "mode": "text", "text": body_text}})
            return

        tpl_block = step.get("template") or {}
        preferred_name = step.get("template_name") or tpl_block.get("name")
        preferred_lang = tpl_block.get("language") or os.getenv("WHATSAPP_TEMPLATE_LANG", "en")
        tpl_name, used_lang, pcount = _choose_wa_template(preferred_name, preferred_lang)
        if not tpl_name or not used_lang:
            _create_notification(user, "WhatsApp template unavailable",
                                 "No approved template/locale available to send outside the 24h window.")
            _collector().append({"type": "send_whatsapp", "status": "skipped", "info": {"reason": "no_template"}})
            return

        raw_params = tpl_block.get("params")
        if isinstance(raw_params, str) and raw_params.strip():
            parts = [p.strip() for p in raw_params.split(",")]
            params = [_render_text(p, lead, run, profile) for p in parts]
            params = (params + [""] * pcount)[:pcount]
        else:
            params = _build_wa_params(pcount, lead, profile, run, body_text)

        shown = f"[template:{tpl_name}/{used_lang}] {body_text}"
        try:
            resp = send_wa_template(to, tpl_name, used_lang, params)
            ok = getattr(resp, "status_code", 500) < 400
        except Exception as e:
            app.logger.error("[Automations] WA template send error: %s", e)
            ok = False
        if ok:
            _mark_sent(run, CHANNEL_WHATSAPP)
            _append_chat_message(user, str(lead.get("id") or lead.get("email") or lead.get("phone") or ""), shown)
            _collector().append({"type": "send_whatsapp", "status": "ok",
                                 "info": {"to": to, "mode": "template",
                                          "template": {"name": tpl_name, "language": used_lang},
                                          "text": body_text}})
        else:
            _collector().append({"type": "send_whatsapp", "status": "error",
                                 "info": {"to": to, "mode": "template",
                                          "template": {"name": tpl_name, "language": used_lang},
                                          "text": body_text}})

    def _exec_if_no_reply(step):
        within_days = int(step.get("within_days", 2))
        match = cond_no_reply_since(lead, within_days)
        _collector().append({"type": "if_no_reply", "status": "ok", "info": {"within_days": within_days, "match": bool(match)}})
        if match:
            for sub in (step.get("then") or []):
                _exec_step(sub)

    def _exec_if_no_booking(step):
        within_days = int(step.get("within_days", 2))
        match = cond_no_booking_since(lead, within_days)
        _collector().append({"type": "if_no_booking", "status": "ok", "info": {"within_days": within_days, "match": bool(match)}})
        if match:
            for sub in (step.get("then") or []):
                _exec_step(sub)

    def _exec_push_owner(step):
        owner = lead.get("owner") or flow.get("owner") or ""
        if owner:
            _create_notification(owner, step.get("title") or "Lead to call", step.get("message") or str(lead.get("email")))
        _collector().append({"type": "push_owner", "status": "ok", "info": {"title": step.get("title"), "message": step.get("message")}})

    def _exec_add_tag(step):
        tag = step.get("tag")
        if tag:
            tags = set((lead.get("tags") or []))
            tags.add(tag)
            lead["tags"] = sorted(list(tags))
            owner = (lead.get("owner") or flow.get("owner") or "").lower()
            if owner:
                lbsu = load_leads()
                arr = lbsu.get(owner, []) or []
                for i, ld in enumerate(arr):
                    if (ld.get("id") == lead.get("id")) or (ld.get("email") == lead.get("email")):
                        arr[i] = lead
                        break
                lbsu[owner] = arr
                save_leads(lbsu)
        _collector().append({"type": "add_tag", "status": "ok", "info": {"tag": tag}})

    def _exec_step(step):
        t = step.get("type")
        if t == "wait":
            if run.get("_ignore_waits"):
                _collector().append({"type": "wait", "status": "skipped"})
            else:
                _collector().append({"type": "wait", "status": "pending"})
            return
        if t == "ai_draft":
            text = ai_draft_message({
                "lead": lead,
                "flow": flow,
                "business_name": profile.get("business_name"),
                "booking_link": profile.get("booking_link"),
            })
            run.setdefault("memo", {})["last_ai_text"] = text
            _collector().append({"type": "ai_draft", "status": "ok", "info": {"text": text}})
            return
        if t == "send_email":
            _exec_send_email(step); return
        if t == "send_whatsapp":
            _exec_send_whatsapp(step); return
        if t == "if_no_reply":
            _exec_if_no_reply(step); return
        if t == "if_no_booking":
            _exec_if_no_booking(step); return
        if t == "push_owner":
            _exec_push_owner(step); return
        if t == "add_tag":
            _exec_add_tag(step); return
        _collector().append({"type": t or "unknown", "status": "ok"})

    for s in (flow.get("steps") or []):
        _exec_step(s)

    did = run.get("_collector", [])
    return jsonify(ok=True, did=did)

# Mount once
if "automations" not in app.blueprints:
    app.register_blueprint(automations_bp, url_prefix="/api/automations")

# ----------------------------
# Leads CRUD + status coloring (robust)
# ----------------------------
from uuid import uuid4
from urllib.parse import unquote

def _email_key(s: str) -> str:
    return (unquote(s or "").strip().lower())

def _now_iso() -> str:
    return datetime.datetime.utcnow().isoformat() + "Z"

def _normalize_phone(s: str) -> str:
    # Use your existing _norm_wa if present; otherwise fallback
    try:
        return _norm_wa(s)
    except Exception:
        import re, os
        d = re.sub(r"\D", "", s or "")
        cc = (os.getenv("DEFAULT_COUNTRY_CODE") or "1").strip()
        return (cc + d) if len(d) == 10 and cc.isdigit() else d

def _assign_lead_defaults(lead: dict, now_iso: str) -> dict:
    ld = dict(lead or {})
    if not ld.get("id"):
        ld["id"] = uuid4().hex
    # normalize names/fields you use elsewhere
    if ld.get("email"):
        ld["email"] = ld["email"].strip().lower()
    # Keep a created timestamp if not present
    if not (ld.get("createdAt") or ld.get("created_at")):
        ld["createdAt"] = now_iso
    # Ensure last_contacted exists (your UI depends on it)
    if not ld.get("last_contacted"):
        ld["last_contacted"] = ld.get("createdAt") or ld.get("created_at") or now_iso
    # Canonical phone/WhatsApp digits for matching
    if ld.get("phone"):
        ld["phone_norm"] = _normalize_phone(ld.get("phone"))
    if ld.get("whatsapp"):
        ld["wa_norm"] = _normalize_phone(ld.get("whatsapp"))
    return ld

def _status_enrich(lead: dict, business_type: str, now_dt: datetime.datetime) -> dict:
    interval = BUSINESS_TYPE_INTERVALS.get((business_type or "").lower(), 14)
    last_contacted = lead.get("last_contacted") or lead.get("createdAt") or lead.get("created_at")
    try:
        last_dt = datetime.datetime.fromisoformat(str(last_contacted).replace("Z", ""))
        days_since = (now_dt - last_dt).days
    except Exception:
        days_since = 0
    if days_since > interval + 2:
        status = "cold";   color = "#e66565"
    elif interval <= days_since <= interval + 2:
        status = "warning"; color = "#f7cb53"
    else:
        status = "active";  color = "#1bc982"
    lead["status"] = status
    lead["status_color"] = color
    lead["days_since_contact"] = days_since
    return lead

def _merge_leads(existing: list[dict], incoming: list[dict]) -> list[dict]:
    """
    Merge on (id) or email or normalized phone/wa. Prefer incoming values, keep ids.
    """
    by_id = {str(x.get("id")): x for x in existing if x.get("id")}
    by_email = {(x.get("email") or "").lower(): x for x in existing if x.get("email")}
    by_phone = {x.get("phone_norm"): x for x in existing if x.get("phone_norm")}
    by_wa    = {x.get("wa_norm"): x for x in existing if x.get("wa_norm")}

    merged = list(existing)  # start with existing objects (preserve references)
    def _update(dst: dict, src: dict):
        # copy simple fields from src onto dst (but keep dst.id)
        keep_id = dst.get("id")
        dst.update(src)
        dst["id"] = keep_id

    for raw in incoming:
        inc = dict(raw)
        key_id = str(inc.get("id") or "")
        key_email = (inc.get("email") or "").lower()
        key_phone = inc.get("phone_norm")
        key_wa    = inc.get("wa_norm")

        target = None
        if key_id and key_id in by_id:
            target = by_id[key_id]
        elif key_email and key_email in by_email:
            target = by_email[key_email]
        elif key_phone and key_phone in by_phone:
            target = by_phone[key_phone]
        elif key_wa and key_wa in by_wa:
            target = by_wa[key_wa]

        if target is None:
            merged.append(inc)
            if inc.get("id"):          by_id[str(inc["id"])] = inc
            if key_email:              by_email[key_email]    = inc
            if key_phone:              by_phone[key_phone]    = inc
            if key_wa:                 by_wa[key_wa]          = inc
        else:
            _update(target, inc)
    return merged

# GET: always decode + lowercase the bucket key and enrich status
@app.route('/api/leads/<path:user_email>', methods=['GET'])
def get_leads(user_email):
    bucket = _email_key(user_email)
    leads_by_user = load_leads()
    leads = [dict(x) for x in leads_by_user.get(bucket, [])]

    users = load_users()
    u = users.get(bucket)
    biz = (u.get("business", "") if u else "").lower()

    now = datetime.datetime.utcnow()
    out = []
    for ld in leads:
        # Backfill defaults if older records are missing them
        if not ld.get("last_contacted"):
            ld["last_contacted"] = ld.get("createdAt") or ld.get("created_at") or _now_iso()
        if ld.get("phone") and not ld.get("phone_norm"):
            ld["phone_norm"] = _normalize_phone(ld.get("phone"))
        if ld.get("whatsapp") and not ld.get("wa_norm"):
            ld["wa_norm"] = _normalize_phone(ld.get("whatsapp"))
        out.append(_status_enrich(ld, biz, now))

    return jsonify({"leads": out}), 200

# POST: accepts {"leads":[...] } OR a single lead object. Assign ids, merge, persist.
@app.route('/api/leads/<path:user_email>', methods=['POST'])
def save_user_leads(user_email):
    bucket = _email_key(user_email)
    payload = request.get_json(force=True, silent=True) or {}

    if isinstance(payload, dict) and "leads" in payload and isinstance(payload["leads"], list):
        incoming = payload["leads"]
    else:
        # accept a single lead object too
        incoming = [payload] if isinstance(payload, dict) else []

    if not incoming:
        return jsonify({"error": "No leads provided"}), 400

    now_iso = _now_iso()
    normalized_incoming = []
    for ld in incoming:
        ld = _assign_lead_defaults(ld, now_iso)
        normalized_incoming.append(ld)

    db = load_leads()
    existing = [dict(x) for x in db.get(bucket, [])]
    merged = _merge_leads(existing, normalized_incoming)

    db[bucket] = merged
    save_leads(db)

    return jsonify({"message": "Leads upserted", "count": len(normalized_incoming), "leads": merged}), 200

# Mark contacted by ID OR by email (fallback), still using normalized bucket key
@app.route('/api/leads/<path:user_email>/<lead_id>/contacted', methods=['POST'])
def mark_lead_contacted(user_email, lead_id):
    bucket = _email_key(user_email)
    db = load_leads()
    arr = db.get(bucket, [])
    if not arr:
        return jsonify({"error": "No leads for this user"}), 404

    lead_id_str = str(lead_id)
    found = False

    # Try by id
    for lead in arr:
        if str(lead.get("id")) == lead_id_str:
            lead["last_contacted"] = _now_iso()
            found = True
            break

    # Fallback: if "lead_id" looks like an email, try by email
    if not found and "@" in lead_id_str:
        lid_email = lead_id_str.strip().lower()
        for lead in arr:
            if (lead.get("email") or "").lower() == lid_email:
                lead["last_contacted"] = _now_iso()
                found = True
                break

    # Fallback 2: phone/wa match
    if not found:
        norm = _normalize_phone(lead_id_str)
        for lead in arr:
            if lead.get("phone_norm") == norm or lead.get("wa_norm") == norm:
                lead["last_contacted"] = _now_iso()
                found = True
                break

    if not found:
        return jsonify({"error": "Lead not found."}), 404

    db[bucket] = arr
    save_leads(db)
    return jsonify({"message": "Lead marked as contacted.", "lead_id": lead_id_str}), 200

# ----------------------------
# Notifications API
# ----------------------------
@app.get('/api/notifications/<user_email>')
def get_notifications(user_email):
    notes = load_notifications().get(user_email, [])
    for n in notes:
        n.setdefault('read', False)
    return jsonify({"notifications": notes}), 200

@app.post('/api/notifications/<user_email>/<int:idx>/mark_read')
def mark_notification_read(user_email, idx):
    all_notes = load_notifications()
    user_notes = all_notes.get(user_email)
    if not user_notes or idx < 0 or idx >= len(user_notes):
        return jsonify({"error": "Notification not found"}), 404
    user_notes[idx]['read'] = True
    all_notes[user_email] = user_notes
    save_notifications(all_notes)
    return ('', 204)

# ----------------------------
# VAPID Push (disabled send)
# ----------------------------
@app.get('/api/vapid-public-key')
def get_vapid_key():
    return jsonify({'publicKey': VAPID_PUBLIC_KEY})

@app.post('/api/save-subscription')
def save_subscription():
    data = request.json or {}
    email = data.get('email')
    subscription = data.get('subscription')
    if not email or not subscription:
        return jsonify({'error': 'Email and subscription required'}), 400
    SUBSCRIPTIONS[email] = subscription
    return jsonify({'message': 'Subscription saved'}), 200

# ----------------------------
# User info & Push
# ----------------------------
@app.get('/api/user/<path:email>')
def get_user(email):
    users = load_users()
    user = users.get(email)
    if not user:
        return jsonify({"error": "User not found"}), 404
    out = {
      "email":        email,
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

@app.post('/api/push/notify')
def push_notify():
    data = request.json or {}
    lead_email   = data.get('lead_email')
    notification = data.get('notification', {})
    sub = SUBSCRIPTIONS.get(lead_email)
    if not sub:
        return jsonify({'error': 'No subscription for that lead'}), 404
    # pywebpush intentionally not bundled in this build.
    return jsonify({'error': 'Push disabled in this build'}), 501

# ----------------------------
# Home
# ----------------------------
@app.get("/")
def home():
    return jsonify({"status": "RetainAI backend running."})

# ----------------------------
# Scheduler bootstrap  (Flask 3.x-safe)
# ----------------------------
def start_scheduler_once():
    if getattr(app, "_scheduler_started", False):
        return
    scheduler = APScheduler()
    scheduler.init_app(app)
    scheduler.start()
    scheduler.add_job(id="lead_reminder_job",      func=check_for_lead_reminders,  trigger="interval", minutes=1)
    scheduler.add_job(id="birthday_greetings_job", func=send_birthday_greetings,   trigger="cron",     hour=8)
    scheduler.add_job(id="trial_ending_soon_job",  func=send_trial_ending_soon,    trigger="cron",     hour=9)
    app.logger.info("JOBS: %s", scheduler.get_jobs())
    app._scheduler_started = True

# Flask 3.x: use before_serving; fallback for older versions
if hasattr(app, "before_serving"):
    @app.before_serving
    def _kick_scheduler():
        start_scheduler_once()
else:
    @app.before_request
    def _kick_scheduler_fallback():
        if not getattr(app, "_scheduler_started", False):
            start_scheduler_once()

# ----------------------------
# Local dev runner ONLY
# ----------------------------
if __name__ == "__main__":
    app.run(debug=True, port=5000)
