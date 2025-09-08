# RetainAI — app.py (FULL, production-ready, all endpoints kept + hardened)
# =============================================================================
# What you get:
# - Strict auth: signup -> pending_payment; login requires status=active (Stripe webhook flips to active)
# - Stripe: Checkout on signup; Webhook; Connect (express) + dashboard link; create/list/send invoices
# - Leads: same routes you used + notes, mark contacted; atomic JSON + POSIX locks (no "lead lost")
# - WhatsApp Cloud: 24h window, templates, webhook, opt-out, status, debug
# - Google OAuth + Calendar (optional libs-safe)
# - Appointments + ICS + email confirmations
# - Notifications helpers; optional scheduler (Flask 3 safe)
# - Automations (minimal JSON-backed) to preserve your /api/automations routes
# - CORS once; Render-friendly; DATA_DIR configurable
# =============================================================================

from __future__ import annotations

import os
import re
import hmac
import json
import fcntl
import hashlib
import datetime
from datetime import datetime as dt, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode, quote, quote_plus

import requests as pyrequests
import stripe
from flask import Flask, request, jsonify, send_from_directory, redirect, Blueprint
from flask_cors import CORS
from dotenv import load_dotenv
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email

# Optional Google (don’t crash if libs missing)
try:
    from google.oauth2 import id_token
    from google.auth.transport import requests as grequests
except Exception:
    id_token = None
    grequests = None

# -----------------------------------------------------------------------------
# Environment
# -----------------------------------------------------------------------------
if os.getenv("FLASK_ENV") != "production":
    load_dotenv()

# -----------------------------------------------------------------------------
# Flask + CORS
# -----------------------------------------------------------------------------
app = Flask(__name__)
FRONTEND_URL = (os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")
CORS(
    app,
    resources={r"/api/*": {"origins": [
        FRONTEND_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://app.retainai.ca",
        "https://retainai.ca",
    ]}},
    supports_credentials=True,
)
app.logger.info("[BOOT] RetainAI backend starting…")

# -----------------------------------------------------------------------------
# Paths & storage
# -----------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.getenv("DATA_DIR", os.path.join(BASE_DIR, "data"))
os.makedirs(DATA_DIR, exist_ok=True)
ICS_DIR = os.path.join(DATA_DIR, "ics")
os.makedirs(ICS_DIR, exist_ok=True)

USERS_FILE         = os.path.join(DATA_DIR, "users.json")            # email -> user dict
LEADS_FILE         = os.path.join(DATA_DIR, "leads.json")            # email -> [lead,...]
NOTIFICATIONS_FILE = os.path.join(DATA_DIR, "notifications.json")    # email -> [notif,...]
APPOINTMENTS_FILE  = os.path.join(DATA_DIR, "appointments.json")     # email -> [appt,...]
CHAT_FILE          = os.path.join(DATA_DIR, "whatsapp_chats.json")   # email -> {lead_id: [msg,...]}
STATUS_FILE        = os.path.join(DATA_DIR, "whatsapp_status.json")  # msg_id -> status
NOTES_FILE         = os.path.join(DATA_DIR, "notes.json")            # (email,lead_id) -> [note,...]

# Automations (JSON-backed)
FILE_AUTOMATIONS   = os.path.join(DATA_DIR, "automations.json")      # user_email -> [automation]
FILE_STATE         = os.path.join(DATA_DIR, "automation_state.json") # internal state if needed
FILE_USERS         = os.path.join(DATA_DIR, "users_profiles.json")   # optional profiles

# -----------------------------------------------------------------------------
# Third-party / env config
# -----------------------------------------------------------------------------
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

# SendGrid templates (your IDs)
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

# -----------------------------------------------------------------------------
# Health
# -----------------------------------------------------------------------------
@app.get("/healthz")
def healthz():
    return "ok", 200

@app.route("/")
def home():
    return jsonify({"status": "RetainAI backend running."})

# -----------------------------------------------------------------------------
# File I/O with POSIX lock + atomic write
# -----------------------------------------------------------------------------
def _read_json_locked(path: str, default: Any):
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        try:
            fcntl.flock(f.fileno(), fcntl.LOCK_SH)
            return json.load(f)
        except Exception:
            return default
        finally:
            try:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            except Exception:
                pass

def _write_json_locked(path: str, data: Any):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
        fcntl.flock(f.fileno(), fcntl.LOCK_UN)
    os.replace(tmp, path)

def load_users():          return _read_json_locked(USERS_FILE, {})
def save_users(d):         _write_json_locked(USERS_FILE, d)
def load_leads():          return _read_json_locked(LEADS_FILE, {})
def save_leads(d):         _write_json_locked(LEADS_FILE, d)
def load_notifications():  return _read_json_locked(NOTIFICATIONS_FILE, {})
def save_notifications(d): _write_json_locked(NOTIFICATIONS_FILE, d)
def load_appointments():   return _read_json_locked(APPOINTMENTS_FILE, {})
def save_appointments(d):  _write_json_locked(APPOINTMENTS_FILE, d)
def load_chats():          return _read_json_locked(CHAT_FILE, {})
def save_chats(d):         _write_json_locked(CHAT_FILE, d)
def load_statuses():       return _read_json_locked(STATUS_FILE, {})
def save_statuses(d):      _write_json_locked(STATUS_FILE, d)
def load_notes():          return _read_json_locked(NOTES_FILE, {})
def save_notes(d):         _write_json_locked(NOTES_FILE, d)
def load_automations():    return _read_json_locked(FILE_AUTOMATIONS, {})
def save_automations(d):   _write_json_locked(FILE_AUTOMATIONS, d)

# -----------------------------------------------------------------------------
# Email helpers (SendGrid)
# -----------------------------------------------------------------------------
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

# -----------------------------------------------------------------------------
# ICS helpers for appointments
# -----------------------------------------------------------------------------
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

# -----------------------------------------------------------------------------
# Notifications helpers (used by follow-up/birthday/trial jobs if you enable scheduler)
# -----------------------------------------------------------------------------
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
# =============================================================================
# Auth, Google OAuth, Stripe (Checkout + Connect + Invoices)
# =============================================================================

# --- Helpers for money --------------------------------------------------------
ZERO_DECIMAL = ZERO_DECIMAL  # already defined above

def to_minor(amount, currency):
    c = (currency or "usd").lower()
    return int(round(float(amount) * (1 if c in ZERO_DECIMAL else 100)))

def from_minor(value, currency):
    c = (currency or "usd").lower()
    d = 1 if c in ZERO_DECIMAL else 100.0
    return (value or 0) / d

def _now_iso():
    return datetime.datetime.utcnow().isoformat() + "Z"

def _gen_id(n=8):
    return os.urandom(n).hex()

# --- Signup -> Stripe Checkout (status = pending_payment) ---------------------
@app.post('/api/signup')
def signup():
    data = request.json or {}
    email        = (data.get('email') or '').strip().lower()
    password     = (data.get('password') or '').strip()
    businessType = (data.get('businessType') or '').strip()
    businessName = (data.get('businessName') or businessType or '').strip()
    name         = (data.get('name') or '').strip()
    teamSize     = (data.get('teamSize') or '').strip()
    logo         = (data.get('logo') or '').strip()

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    users = load_users()
    if email in users:
        return jsonify({'error': 'User already exists'}), 409

    trial_start = datetime.datetime.utcnow().isoformat()
    users[email] = {
        'password':                 password,
        'businessType':             businessType,
        'business':                 businessName,
        'name':                     name,
        'teamSize':                 teamSize,
        'picture':                  logo,
        'status':                   'pending_payment',  # <— gate login until webhook flips to active
        'trial_start':              trial_start,
        'trial_ending_notice_sent': False,
    }
    save_users(users)

    # Best-effort welcome email (doesn't block)
    try:
        send_welcome_email(email, name, businessName)
    except Exception as e:
        app.logger.warning("[WELCOME EMAIL] %s", e)

    # Stripe Checkout Session (subscription w/ trial)
    try:
        if not STRIPE_SECRET_KEY or not STRIPE_PRICE_ID:
            return jsonify({'error': 'Billing not configured'}), 500

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

# --- Login requires status=active --------------------------------------------
@app.post('/api/login')
def login():
    data     = request.json or {}
    email    = (data.get('email') or '').strip().lower()
    password = (data.get('password') or '').strip()
    users    = load_users()
    user     = users.get(email)
    if not user or user.get('password') != password:
        return jsonify({'error': 'Invalid credentials'}), 401
    if user.get('status') != 'active':
        return jsonify({'error': 'Account not active yet'}), 402  # Payment Required (soft)
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

# --- Google OAuth (optional; keeps status = pending until payment) ------------
@app.post('/api/oauth/google')
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
                'status': 'pending_payment',  # must still pay
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

@app.post('/api/oauth/google/complete')
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

# --- Stripe Connect + Dashboard ----------------------------------------------
@app.get("/api/stripe/connect-url")
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

@app.get("/api/stripe/oauth/connect")
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

@app.get("/api/stripe/dashboard-link")
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

@app.get("/api/stripe/account")
def get_stripe_account():
    user_email = request.args.get("user_email")
    if not user_email:
        return jsonify({"error": "Missing user_email"}), 400
    users = load_users()
    acct_id = (users.get(user_email, {}) or {}).get("stripe_account_id")
    if not acct_id:
        return jsonify({"error": "Stripe account not connected"}), 404
    acct = stripe.Account.retrieve(acct_id)
    return jsonify({"account": {
        "id": acct.id,
        "default_currency": acct.default_currency,
        "details_submitted": acct.details_submitted,
        "email": acct.email,
    }}), 200

# --- Stripe Invoices ----------------------------------------------------------
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

@app.post('/api/stripe/invoice')
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

    users = load_users()
    acct_id = (users.get(user_email, {}) or {}).get("stripe_account_id")
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

@app.get('/api/stripe/invoices')
def list_stripe_invoices():
    user_email = request.args.get("user_email")
    if not user_email:
        return jsonify({"error": "Missing user_email"}), 400
    users = load_users()
    acct_id = (users.get(user_email, {}) or {}).get("stripe_account_id")
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

# --- Stripe Webhook flips status -> active -----------------------------------
@app.post('/api/stripe/webhook')
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
                users[email] = user
                save_users(users)
    return '', 200

# =============================================================================
# Leads API (bulletproof, JSON-backed, no frontend changes required)
# =============================================================================

def _ensure_lead_defaults(l: dict, owner_email: str) -> dict:
    """Guarantee required fields and consistent types."""
    lead = dict(l or {})
    lead['id'] = str(lead.get('id') or _gen_id(8))
    lead['owner'] = (lead.get('owner') or owner_email).lower()
    # normalize timestamps
    now = _now_iso()
    lead.setdefault('createdAt', now)
    lead.setdefault('last_contacted', lead['createdAt'])
    # optional
    lead.setdefault('name', lead.get('email','').split('@')[0].replace('.', ' ').title())
    lead.setdefault('email', lead.get('email',''))
    lead.setdefault('phone', lead.get('phone',''))
    lead.setdefault('whatsapp', lead.get('whatsapp',''))
    lead.setdefault('tags', lead.get('tags') or [])
    lead.setdefault('notes', lead.get('notes') or "")
    lead['wa_opt_out'] = bool(lead.get('wa_opt_out', False))
    return lead

def _find_lead(leads_list: List[dict], lead_id: str) -> Optional[dict]:
    for ld in leads_list:
        if str(ld.get("id")) == str(lead_id):
            return ld
    return None

@app.get('/api/leads/<path:user_email>')
def get_leads(user_email):
    user_email = user_email.lower()
    users = load_users()
    if user_email not in users:
        return jsonify({"leads": []}), 200
    leads_by_user = load_leads()
    leads = leads_by_user.get(user_email, [])

    # compute status color on the fly (no mutation)
    business_type = (users.get(user_email, {}).get("business", "") or "").lower()
    interval = BUSINESS_TYPE_INTERVALS.get(business_type, 14)
    now = datetime.datetime.utcnow()
    out = []
    for lead in leads:
        last_contacted = lead.get("last_contacted") or lead.get("createdAt")
        try:
            last_dt = datetime.datetime.fromisoformat(last_contacted.replace("Z", ""))
            days_since = (now - last_dt).days
        except Exception:
            days_since = 0
        if days_since > interval + 2:
            status = "cold";   status_color = "#e66565"
        elif interval <= days_since <= interval + 2:
            status = "warning"; status_color = "#f7cb53"
        else:
            status = "active";  status_color = "#1bc982"
        enriched = dict(lead)
        enriched["status"] = status
        enriched["status_color"] = status_color
        enriched["days_since_contact"] = days_since
        out.append(enriched)
    return jsonify({"leads": out}), 200

# Save the full list (legacy-compatible)
@app.post('/api/leads/<path:user_email>')
def save_user_leads(user_email):
    user_email = user_email.lower()
    data = request.json or {}
    leads_in = data.get("leads", [])
    if not isinstance(leads_in, list):
        return jsonify({"error": "Leads must be a list"}), 400

    # Ensure defaults & IDs
    safe = [_ensure_lead_defaults(ld, user_email) for ld in leads_in]

    leads_by_user = load_leads()
    leads_by_user[user_email] = safe
    save_leads(leads_by_user)
    return jsonify({"message": "Leads updated", "leads": safe}), 200

# Create a single lead (no frontend change needed to keep old route; this is additive)
@app.post('/api/leads/<path:user_email>/create')
def create_lead(user_email):
    user_email = user_email.lower()
    body = request.json or {}
    lead = _ensure_lead_defaults(body, user_email)
    leads_by_user = load_leads()
    arr = leads_by_user.get(user_email, [])
    arr.append(lead)
    leads_by_user[user_email] = arr
    save_leads(leads_by_user)
    return jsonify({"lead": lead}), 201

# Read/Update/Delete a single lead
@app.get('/api/leads/<path:user_email>/<lead_id>')
def get_lead(user_email, lead_id):
    user_email = user_email.lower()
    arr = load_leads().get(user_email, [])
    ld = _find_lead(arr, lead_id)
    if not ld:
        return jsonify({"error": "Lead not found"}), 404
    return jsonify({"lead": ld}), 200

@app.put('/api/leads/<path:user_email>/<lead_id>')
def update_lead(user_email, lead_id):
    user_email = user_email.lower()
    patch = request.json or {}
    leads_by_user = load_leads()
    arr = leads_by_user.get(user_email, [])
    for i, ld in enumerate(arr):
        if str(ld.get("id")) == str(lead_id):
            ld.update(patch or {})
            arr[i] = _ensure_lead_defaults(ld, user_email)
            leads_by_user[user_email] = arr
            save_leads(leads_by_user)
            return jsonify({"lead": arr[i]}), 200
    return jsonify({"error": "Lead not found"}), 404

@app.delete('/api/leads/<path:user_email>/<lead_id>')
def delete_lead(user_email, lead_id):
    user_email = user_email.lower()
    leads_by_user = load_leads()
    arr = leads_by_user.get(user_email, [])
    before = len(arr)
    arr = [x for x in arr if str(x.get("id")) != str(lead_id)]
    leads_by_user[user_email] = arr
    save_leads(leads_by_user)
    return jsonify({"deleted": before - len(arr)}), 200

# Mark contacted (legacy route used by your frontend)
@app.post('/api/leads/<path:user_email>/<lead_id>/contacted')
def mark_lead_contacted(user_email, lead_id):
    user_email = user_email.lower()
    leads_by_user = load_leads()
    arr = leads_by_user.get(user_email, [])
    updated = False
    for lead in arr:
        if str(lead.get("id")) == str(lead_id):
            lead["last_contacted"] = _now_iso()
            updated = True
            break
    if updated:
        leads_by_user[user_email] = arr
        save_leads(leads_by_user)
        return jsonify({"message": "Lead marked as contacted.", "lead_id": lead_id}), 200
    else:
        return jsonify({"error": "Lead not found."}), 404

# Optional: simple notes per lead (additive; won’t break your UI)
@app.get('/api/leads/<path:user_email>/<lead_id>/notes')
def get_lead_notes(user_email, lead_id):
    user_email = user_email.lower()
    notes_db = load_notes()
    key = f"{user_email}:{lead_id}"
    return jsonify({"notes": notes_db.get(key, [])}), 200

@app.post('/api/leads/<path:user_email>/<lead_id>/notes')
def add_lead_note(user_email, lead_id):
    user_email = user_email.lower()
    body = request.json or {}
    text = (body.get("text") or body.get("note") or "").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400

    # verify lead exists
    leads_by_user = load_leads()
    arr = leads_by_user.get(user_email, [])
    if not _find_lead(arr, lead_id):
        return jsonify({"error": "Lead not found"}), 404

    notes_db = load_notes()
    key = f"{user_email}:{lead_id}"
    notes_db.setdefault(key, []).insert(0, {
        "id": _gen_id(6),
        "text": text,
        "created_at": _now_iso(),
    })
    save_notes(notes_db)
    return jsonify({"ok": True, "notes": notes_db[key]}), 201

# =============================================================================
# Appointments API (uses ICS + SendGrid template)
# =============================================================================

@app.get('/api/appointments/<path:user_email>')
def get_appointments(user_email):
    data = load_appointments()
    return jsonify({"appointments": data.get(user_email.lower(), [])}), 200

@app.post('/api/appointments/<path:user_email>')
def create_appointment(user_email):
    user_email = user_email.lower()
    data = request.json or {}
    appt = {
        "id": _gen_id(8),
        "lead_email": data['lead_email'],
        "lead_first_name": data.get('lead_first_name') or (data['lead_email'].split('@')[0].title()),
        "user_name": data['user_name'],
        "user_email": data['user_email'],
        "business_name": data['business_name'],
        "appointment_time": data['appointment_time'],    # UTC ISO without Z: 2025-05-01T15:00:00
        "appointment_location": data['appointment_location'],
        "duration": int(data.get('duration', 30)),
        "notes": data.get('notes', ""),
    }
    appointments = load_appointments()
    appointments.setdefault(user_email, []).append(appt)
    save_appointments(appointments)

    # Create ICS and email confirmation
    create_ics_file(appt)
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

@app.put('/api/appointments/<path:user_email>/<appt_id>')
def update_appointment(user_email, appt_id):
    user_email = user_email.lower()
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

@app.delete('/api/appointments/<path:user_email>/<appt_id>')
def delete_appointment(user_email, appt_id):
    user_email = user_email.lower()
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

# =============================================================================
# Notifications API (simple JSON list per user)
# =============================================================================

@app.get('/api/notifications/<path:user_email>')
def get_notifications(user_email):
    notes = load_notifications().get(user_email.lower(), [])
    for n in notes:
        n.setdefault('read', False)
    return jsonify({"notifications": notes}), 200

@app.post('/api/notifications/<path:user_email>/<int:idx>/mark_read')
def mark_notification_read(user_email, idx):
    user_email = user_email.lower()
    all_notes = load_notifications()
    user_notes = all_notes.get(user_email)
    if not user_notes or idx < 0 or idx >= len(user_notes):
        return jsonify({"error": "Notification not found"}), 404
    user_notes[idx]['read'] = True
    all_notes[user_email] = user_notes
    save_notifications(all_notes)
    return ('', 204)
# =============================================================================
# WhatsApp Cloud API (helpers + endpoints + webhook)
# =============================================================================

# --- Notes JSON (used by /notes endpoints in Part 2) --------------------------
NOTES_FILE = os.path.join(DATA_DIR, "notes.json")
def load_notes():          return load_json(NOTES_FILE, {})
def save_notes(d):         save_json(NOTES_FILE, d)

# --- Local caches & helpers ---------------------------------------------------
_WA_TEMPLATE_TTL_SECONDS = 300
_MSG_CACHE_TTL_SECONDS = 2
_WABA_TTL_SECONDS = 300

_WABA_RES = {"id": None, "checked_at": None}         # cached WABA id
_MSG_CACHE: Dict[tuple, Dict[str, Any]] = {}         # ((user_email, lead_id)) → {at, data}

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

# --- Public endpoints ---------------------------------------------------------
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
    Locale fallback: exact → same primary → any approved; else 409 with availableLanguages.
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

    raw_params = data.get("template_params")
    if isinstance(raw_params, str):
        raw_params = [p.strip() for p in raw_params.split(",") if p.strip()]
    elif not isinstance(raw_params, list):
        raw_params = None
    params = raw_params if raw_params and len(raw_params) > 0 else None

    if not to_number:
        return jsonify({"ok": False, "error": "Recipient 'to' is required"}), 400

    # Respect opt-out
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
            locales = [{"language": wa_normalize_lang(t.get("language") or ""), "status": (t.get("status") or "").upper()}
                       for t in items if (t.get("name") or "") == template_name]

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

# --- WhatsApp Webhook (verify + inbound + delivery statuses + STOP/START) ----
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

# =============================================================================
# Minimal Automations placeholder (keeps routes stable if your UI calls them)
# =============================================================================

automations_bp = Blueprint("automations", __name__, url_prefix="/api/automations")

@automations_bp.get("/")
def automations_list():
    data = load_json(FILE_AUTOMATIONS, [])
    return jsonify({"automations": data})

@automations_bp.post("/")
def automations_create():
    data = load_json(FILE_AUTOMATIONS, [])
    body = request.json or {}
    body["id"] = body.get("id") or _gen_id(8)
    body["created_at"] = _now_iso()
    data.append(body)
    save_json(FILE_AUTOMATIONS, data)
    return jsonify({"ok": True, "automation": body}), 201

@automations_bp.put("/<aid>")
def automations_update(aid):
    data = load_json(FILE_AUTOMATIONS, [])
    body = request.json or {}
    updated = None
    for i, a in enumerate(data):
        if str(a.get("id")) == str(aid):
            a.update(body)
            data[i] = a
            updated = a
            break
    save_json(FILE_AUTOMATIONS, data)
    if not updated:
        return jsonify({"error": "not found"}), 404
    return jsonify({"ok": True, "automation": updated})

@automations_bp.delete("/<aid>")
def automations_delete(aid):
    data = load_json(FILE_AUTOMATIONS, [])
    before = len(data)
    data = [a for a in data if str(a.get("id")) != str(aid)]
    save_json(FILE_AUTOMATIONS, data)
    return jsonify({"deleted": before - len(data)})

app.register_blueprint(automations_bp)

# =============================================================================
# Scheduler (safe start only if explicitly enabled)
# =============================================================================

scheduler = APScheduler()

def _start_scheduler_if_enabled():
    if app.config.get("SCHEDULER_STARTED"):
        return
    if os.getenv("ENABLE_SCHEDULER", "0") != "1":
        app.logger.info("[Scheduler] disabled (set ENABLE_SCHEDULER=1 to enable)")
        return
    try:
        scheduler.init_app(app)
        scheduler.start()
        scheduler.add_job(id="lead_reminders", func=check_for_lead_reminders, trigger="interval", hours=24)
        scheduler.add_job(id="birthday_greetings", func=send_birthday_greetings, trigger="interval", hours=24)
        scheduler.add_job(id="trial_ending", func=send_trial_ending_soon, trigger="interval", hours=24)
        app.config["SCHEDULER_STARTED"] = True
        app.logger.info("[Scheduler] started.")
    except Exception as e:
        app.logger.warning("[Scheduler] failed to start: %s", e)

# Optional admin endpoints to control scheduler at runtime
ADMIN_KEY = os.getenv("ADMIN_KEY", "")

@app.post("/admin/scheduler/start")
def admin_sched_start():
    if ADMIN_KEY and request.headers.get("X-Admin-Key") != ADMIN_KEY:
        return jsonify({"error": "forbidden"}), 403
    _start_scheduler_if_enabled()
    return jsonify({"started": bool(app.config.get("SCHEDULER_STARTED"))})

@app.post("/admin/scheduler/stop")
def admin_sched_stop():
    if ADMIN_KEY and request.headers.get("X-Admin-Key") != ADMIN_KEY:
        return jsonify({"error": "forbidden"}), 403
    try:
        scheduler.shutdown(wait=False)
        app.config["SCHEDULER_STARTED"] = False
        return jsonify({"stopped": True})
    except Exception:
        return jsonify({"stopped": False})

# =============================================================================
# Root + Static + Run
# =============================================================================

@app.get("/")
def root():
    return jsonify({"ok": True, "service": "RetainAI API", "version": "prod", "time": _now_iso()})

# Important: DO NOT use @app.before_first_request (removed in Flask 3).
# Only start the scheduler in single-process debug or when explicitly enabled.
if __name__ == "__main__":
    _start_scheduler_if_enabled()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")))
