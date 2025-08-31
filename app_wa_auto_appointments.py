# backend/app_wa_auto_appointments.py
from flask import Blueprint, request, jsonify
import os, re, json, uuid, datetime
from typing import Any, Dict, List, Optional

# =========================================================
# Blueprint
# =========================================================
WA_AUTO_BP = Blueprint("wa_auto_bp", __name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FILE_APPTS   = os.path.join(BASE_DIR, "appointments.json")          # { "appointments": { "<user_email>": [ ... ] } }
FILE_PENDING = os.path.join(BASE_DIR, "appointments_pending.json")  # { "pending":      { "<user_email>": [ ... ] } }
FILE_NOTIFS  = os.path.join(BASE_DIR, "notifications.json")         # { "notifications":{ "<user_email>": [ ... ] } }

WHATSAPP_TOKEN       = os.getenv("WHATSAPP_TOKEN", "")
WHATSAPP_PHONE_ID    = os.getenv("WHATSAPP_PHONE_ID", "")
WHATSAPP_API_VERSION = os.getenv("WHATSAPP_API_VERSION", "v20.0")

# =========================================================
# Utils
# =========================================================
def _now_iso() -> str:
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

def _read_json(path: str, default: Any):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def _write_json(path: str, data: Any):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)

def _ensure_files():
    if not os.path.exists(FILE_APPTS):
        _write_json(FILE_APPTS, {"appointments": {}})
    if not os.path.exists(FILE_PENDING):
        _write_json(FILE_PENDING, {"pending": {}})
    if not os.path.exists(FILE_NOTIFS):
        _write_json(FILE_NOTIFS, {"notifications": {}})

_ensure_files()

def _digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")

# =========================================================
# Notifications (stored for UI)
# =========================================================
def _notify(user_email: str, title: str, body: str):
    user_email = (user_email or "").lower()
    db = _read_json(FILE_NOTIFS, {"notifications": {}})
    arr = db.setdefault("notifications", {}).setdefault(user_email, [])
    arr.insert(0, {
        "id": "note_" + str(uuid.uuid4())[:8],
        "title": title,
        "body": body,
        "created_at": _now_iso(),
        "read": False
    })
    _write_json(FILE_NOTIFS, db)

# =========================================================
# (Optional) WhatsApp sender (no-op in dev without creds)
# =========================================================
def _wa_send_text(phone_e164: str, text: str) -> bool:
    if not phone_e164 or not text:
        return False
    if not (WHATSAPP_TOKEN and WHATSAPP_PHONE_ID):
        print("[WA] (simulated) ->", phone_e164, ":", text[:200])
        return True
    try:
        import requests
        url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_ID}/messages"
        headers = {"Authorization": f"Bearer {WHATSAPP_TOKEN}", "Content-Type": "application/json"}
        payload = {"messaging_product": "whatsapp", "to": phone_e164, "type": "text", "text": {"body": text[:1024]}}
        r = requests.post(url, headers=headers, json=payload, timeout=20)
        if not (200 <= r.status_code < 300):
            print("[WA] send failed:", r.status_code, r.text)
            return False
        return True
    except Exception as e:
        print("[WA] exception:", e)
        return False

# =========================================================
# Lightweight NLU for scheduling intents
# =========================================================
AFFIRM_WORDS = [
    "yes", "yep", "yeah", "sure", "ok", "okay", "sounds good", "that works", "confirm", "book it", "let’s do it",
]
REJECT_WORDS = [
    "no", "nope", "not now", "can’t", "cant", "another time", "later"
]

TIME_PATTERNS = [
    r"(?P<h>\d{1,2})[:\.](?P<m>\d{2})\s*(?P<p>am|pm)?",
    r"(?P<h>\d{1,2})\s*(?P<p>am|pm)",
    r"(?P<h>\d{1,2})\s*o'?clock",
]

DAY_WORDS = {
    "today": 0,
    "tomorrow": 1,
    "tmrw": 1,
    "mon": 0, "monday": 0,
    "tue": 1, "tues": 1, "tuesday": 1,
    "wed": 2, "wednesday": 2,
    "thu": 3, "thur": 3, "thurs": 3, "thursday": 3,
    "fri": 4, "friday": 4,
    "sat": 5, "saturday": 5,
    "sun": 6, "sunday": 6,
}

def _next_weekday(base: datetime.date, target_weekday: int) -> datetime.date:
    delta = (target_weekday - base.weekday()) % 7
    return base + datetime.timedelta(days=delta)

def parse_datetime_from_text(text: str) -> Optional[datetime.datetime]:
    if not text:
        return None
    t = text.lower()

    base_dt = datetime.datetime.now()
    date_anchor = base_dt.date()
    matched_day = False

    for k, idx in DAY_WORDS.items():
        if re.search(rf"\b{k}\b", t):
            matched_day = True
            if k in ("today", "tomorrow", "tmrw"):
                date_anchor = (base_dt + datetime.timedelta(days=DAY_WORDS[k])).date()
            else:
                date_anchor = _next_weekday(base_dt.date(), idx)
            break

    hh = mm = None
    pm = None
    for pat in TIME_PATTERNS:
        m = re.search(pat, t)
        if m:
            hh = int(m.group("h"))
            mm = int(m.group("m")) if "m" in m.groupdict() and m.group("m") else 0
            pm = m.group("p") if "p" in m.groupdict() and m.get("p") else None
            break
    if hh is None:
        return None

    if pm == "pm" and 1 <= hh <= 11:
        hh += 12
    if pm == "am" and hh == 12:
        hh = 0
    if hh == 24:
        hh = 0

    dt = datetime.datetime(date_anchor.year, date_anchor.month, date_anchor.day, hh, mm or 0)
    if not matched_day and dt <= base_dt:
        dt = dt + datetime.timedelta(days=1)
    return dt

def detect_intent(text: str) -> Dict[str, Any]:
    t = (text or "").strip().lower()
    if not t:
        return {"intent": "unknown"}

    for w in AFFIRM_WORDS:
        if re.search(rf"\b{re.escape(w)}\b", t):
            return {"intent": "affirm"}
    for w in REJECT_WORDS:
        if re.search(rf"\b{re.escape(w)}\b", t):
            return {"intent": "reject"}

    dt = parse_datetime_from_text(t)
    if dt:
        return {"intent": "propose_time", "when": dt.isoformat()}

    return {"intent": "unknown"}

# =========================================================
# Storage helpers
# =========================================================
def _get_appointments(user_email: str) -> List[Dict[str, Any]]:
    db = _read_json(FILE_APPTS, {"appointments": {}})
    return db.get("appointments", {}).get(user_email.lower(), [])

def _save_appointments(user_email: str, arr: List[Dict[str, Any]]):
    user_email = (user_email or "").lower()
    db = _read_json(FILE_APPTS, {"appointments": {}})
    db.setdefault("appointments", {})[user_email] = arr
    _write_json(FILE_APPTS, db)

def _add_appointment(user_email: str, appt: Dict[str, Any]) -> Dict[str, Any]:
    arr = _get_appointments(user_email)
    arr.append(appt)
    arr.sort(key=lambda a: a.get("appointment_time", ""))
    _save_appointments(user_email, arr)
    return appt

def _get_pending(user_email: str) -> List[Dict[str, Any]]:
    db = _read_json(FILE_PENDING, {"pending": {}})
    return db.get("pending", {}).get(user_email.lower(), [])

def _save_pending(user_email: str, arr: List[Dict[str, Any]]):
    user_email = (user_email or "").lower()
    db = _read_json(FILE_PENDING, {"pending": {}})
    db.setdefault("pending", {})[user_email] = arr
    _write_json(FILE_PENDING, db)

def _add_pending(user_email: str, s: Dict[str, Any]) -> Dict[str, Any]:
    arr = _get_pending(user_email)
    # de-dupe by (lead_id + suggested_time + note)
    for x in arr:
        if (
            x.get("lead_id") == s.get("lead_id") and
            (x.get("suggested_time") or "") == (s.get("suggested_time") or "") and
            (x.get("note") or "") == (s.get("note") or "")
        ):
            return x
    arr.insert(0, s)
    _save_pending(user_email, arr)
    return s

def _remove_pending(user_email: str, sid: str) -> Optional[Dict[str, Any]]:
    arr = _get_pending(user_email)
    keep, removed = [], None
    for x in arr:
        if x.get("id") == sid:
            removed = x
        else:
            keep.append(x)
    _save_pending(user_email, keep)
    return removed

# =========================================================
# Helpers for tolerant time extraction
# =========================================================
def _extract_when_from_body(body: Dict[str, Any]) -> Optional[str]:
    """
    Accept several shapes:
    - appointment_time (ISO)
    - when / start / start_time / proposed_time / time (ISO)
    - Google style: { "start": { "dateTime": "..." } }
    Returns ISO string or None.
    """
    for k in ["appointment_time", "when", "start", "start_time", "proposed_time", "time"]:
        v = body.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    start = body.get("start")
    if isinstance(start, dict):
        dt = start.get("dateTime") or start.get("datetime")
        if isinstance(dt, str) and dt.strip():
            return dt.strip()
    return None

def _find_pending_by_id(user_email: str, pending_id: str) -> Optional[Dict[str, Any]]:
    user_email = (user_email or "").lower()
    arr = _get_pending(user_email)
    for x in arr:
        if x.get("id") == pending_id:
            return x
    return None

# =========================================================
# Core processing for inbound WA messages
# =========================================================
def process_incoming_message(user_email: str, lead: Dict[str, Any], text: str) -> Dict[str, Any]:
    ie = (user_email or "").lower().strip()
    if not ie or not lead:
        return {"ok": False, "error": "missing_user_or_lead"}

    intent = detect_intent(text)
    intent_name = intent.get("intent")
    e164 = _digits(lead.get("whatsapp") or lead.get("phone") or "")

    if intent_name == "reject":
        _notify(ie, "Client not ready", f"{lead.get('name') or lead.get('email')} said no / not now.")
        if e164:
            _wa_send_text(e164, "No problem — we can revisit scheduling anytime. Thanks!")
        return {"ok": True, "action": "noted_reject"}

    if intent_name == "affirm":
        sug = {
            "id": "sug_" + str(uuid.uuid4())[:8],
            "created_at": _now_iso(),
            "lead_id": lead.get("id"),
            "lead_name": lead.get("name"),
            "lead_email": lead.get("email"),
            "lead_phone": e164,
            "suggested_time": None,
            "status": "await_time",
            "note": "Client affirmed interest in booking.",
        }
        _add_pending(ie, sug)
        _notify(ie, "Appointment interest", f"{lead.get('name') or lead.get('email')} is ready to book. Pick a time.")
        if e164:
            _wa_send_text(e164, "Great! I’ll send over a couple of times shortly.")
        return {"ok": True, "action": "pending_created", "pending": sug}

    if intent_name == "propose_time":
        when_iso = intent.get("when")
        sug = {
            "id": "sug_" + str(uuid.uuid4())[:8],
            "created_at": _now_iso(),
            "lead_id": lead.get("id"),
            "lead_name": lead.get("name"),
            "lead_email": lead.get("email"),
            "lead_phone": e164,
            "suggested_time": when_iso,
            "status": "await_owner_confirm",
            "note": f"Client proposed {when_iso}",
        }
        _add_pending(ie, sug)
        pretty = datetime.datetime.fromisoformat(when_iso).strftime("%a %b %d, %I:%M %p")
        _notify(ie, "Client proposed a time",
                f"{lead.get('name') or lead.get('email')} suggested {pretty}. Confirm to add to calendar.")
        if e164:
            _wa_send_text(e164, "Thanks! I’ll confirm this time and send you a calendar invite.")
        return {"ok": True, "action": "pending_created", "pending": sug}

    return {"ok": True, "action": "ignored", "intent": intent_name}

# =========================================================
# Routes
# =========================================================
@WA_AUTO_BP.route("/api/wa-auto/inbound", methods=["POST"])
def wa_auto_inbound():
    """
    Test endpoint if not wired to your webhook yet.
    Body:
    {
      "user_email": "...",
      "lead": { "id":"...", "name":"...", "email":"...", "phone":"...", "whatsapp":"..." },
      "text": "client's message"
    }
    """
    body = request.get_json(force=True) or {}
    user_email = (body.get("user_email") or "").strip().lower()
    lead = body.get("lead") or {}
    text = body.get("text") or ""
    out = process_incoming_message(user_email, lead, text)
    return jsonify(out)

# ----- Pending suggestions -----
@WA_AUTO_BP.route("/api/wa-auto/pending/<path:user_email>", methods=["GET"])
def wa_auto_list_pending(user_email):
    return jsonify({"pending": _get_pending((user_email or "").lower())})

@WA_AUTO_BP.route("/api/wa-auto/pending/<path:user_email>/<pending_id>/dismiss", methods=["POST"])
def wa_auto_dismiss_pending(user_email, pending_id):
    removed = _remove_pending((user_email or "").lower(), pending_id)
    return jsonify({"ok": True, "removed": bool(removed)})

@WA_AUTO_BP.route("/api/wa-auto/confirm", methods=["POST"])
def wa_auto_confirm():
    """
    Body:
    {
      "user_email": "...",
      "pending_id": "sug_abcd1234",
      "duration": 30,
      "location": "Office / link",
      "notes": "optional"
    }
    Creates appointment -> removes pending, pings client.
    """
    b = request.get_json(force=True) or {}
    user_email = (b.get("user_email") or "").strip().lower()
    sid = b.get("pending_id")
    if not (user_email and sid):
        return jsonify({"ok": False, "error": "missing_params"}), 400

    sug = _remove_pending(user_email, sid)
    if not sug:
        return jsonify({"ok": False, "error": "not_found"}), 404

    when_iso = sug.get("suggested_time")
    if not when_iso:
        return jsonify({"ok": False, "error": "pending_has_no_time"}), 400

    appt = {
        "id": "apt_" + str(uuid.uuid4())[:8],
        "created_at": _now_iso(),
        "appointment_time": when_iso,  # ISO string
        "duration": int(b.get("duration") or 30),
        "appointment_location": b.get("location") or "TBD",
        "notes": b.get("notes") or "",
        "lead_id": sug.get("lead_id") or "",
        "lead_first_name": (sug.get("lead_name") or (sug.get("lead_email") or "")).split(" ")[0],
        "lead_email": sug.get("lead_email") or "",
        "business_name": "Your Business",
    }
    _add_appointment(user_email, appt)

    pretty = datetime.datetime.fromisoformat(when_iso).strftime("%a %b %d, %I:%M %p")
    _notify(user_email, "Appointment booked", f"{appt['lead_first_name']} confirmed for {pretty}.")
    if sug.get("lead_phone"):
        _wa_send_text(sug["lead_phone"],
                      f"Confirmed for {pretty}. I’ve added it to the calendar and will see you then!")

    return jsonify({"ok": True, "appointment": appt})

# ----- Calendar API (global appointments per user) -----
# NOTE: namespaced under /api/wa-auto/... to avoid clashing with app.py
@WA_AUTO_BP.route("/api/wa-auto/appointments/<path:user_email>", methods=["GET"])
def list_wa_auto_appointments(user_email):
    return jsonify({"appointments": _get_appointments((user_email or "").lower())})

@WA_AUTO_BP.route("/api/wa-auto/appointments/<path:user_email>", methods=["POST"])
def add_wa_auto_appointment(user_email):
    """
    Direct booking (tolerant):
      - JSON keys: appointment_time / when / start / start_time / proposed_time / time
      - Google style: {"start":{"dateTime":"..."}}
      - Or provide pending_id to pull time from suggestions
      - Also accepts query/form fallbacks
    """
    user_email = (user_email or "").lower()
    b = request.get_json(force=True) or {}

    # 1) JSON extraction
    when = _extract_when_from_body(b)

    # 2) Query string fallback: ?appointment_time=... or ?when=...
    if not when:
        for k in ["appointment_time", "when", "start", "start_time", "proposed_time", "time"]:
            v = request.args.get(k)
            if v:
                when = v.strip()
                break

    # 3) Form-data fallback
    if not when and request.form:
        for k in ["appointment_time", "when", "start", "start_time", "proposed_time", "time"]:
            v = request.form.get(k)
            if v:
                when = v.strip()
                break

    # 4) pending_id fallback (works with JSON/query/form)
    pending_id = b.get("pending_id") or request.args.get("pending_id") or (request.form.get("pending_id") if request.form else None)
    if not when and pending_id:
        sug = _find_pending_by_id(user_email, pending_id)
        if not sug:
            return jsonify({"ok": False, "error": "pending_not_found"}), 404
        when = sug.get("suggested_time")

    if not when:
        return jsonify({"ok": False, "error": "missing_time",
                        "hint": "Send appointment_time (ISO) in JSON, query, or form, or include pending_id"}), 400

    appt = {
        "id": "apt_" + str(uuid.uuid4())[:8],
        "created_at": _now_iso(),
        "appointment_time": when,
        "duration": int(b.get("duration") or 30),
        "appointment_location": b.get("appointment_location") or "TBD",
        "notes": b.get("notes") or "",
        "lead_id": b.get("lead_id") or "",
        "lead_first_name": b.get("lead_first_name") or "",
        "lead_email": b.get("lead_email") or "",
        "business_name": b.get("business_name") or "Your Business",
    }
    _add_appointment(user_email, appt)
    _notify(user_email, "Appointment added", f"{appt['lead_first_name']} • {appt['appointment_time']}")
    return jsonify({"ok": True, "appointment": appt})

@WA_AUTO_BP.route("/api/wa-auto/appointments/<path:user_email>/<appt_id>/done", methods=["POST"])
def mark_wa_auto_appointment_done(user_email, appt_id):
    user_email = (user_email or "").lower()
    arr = _get_appointments(user_email)
    for a in arr:
        if a.get("id") == appt_id:
            a["done"] = True
    _save_appointments(user_email, arr)
    return jsonify({"ok": True})

@WA_AUTO_BP.route("/api/wa-auto/appointments/<path:user_email>/<appt_id>", methods=["DELETE"])
def delete_wa_auto_appointment(user_email, appt_id):
    user_email = (user_email or "").lower()
    arr = _get_appointments(user_email)
    arr = [a for a in arr if a.get("id") != appt_id]
    _save_appointments(user_email, arr)
    return jsonify({"ok": True})

# =========================================================
# --------- ALIAS ROUTES (lead-scoped) — namespaced -------
# =========================================================

# List appointments for a given lead (server-side filter)
@WA_AUTO_BP.route("/api/wa-auto/leads/<path:user_email>/<lead_id>/appointments", methods=["GET"])
def list_wa_auto_lead_appointments(user_email, lead_id):
    user_email = (user_email or "").lower()
    all_appts = _get_appointments(user_email)
    return jsonify({"appointments": [a for a in all_appts if (a.get("lead_id") or "") == (lead_id or "")]})

# Create appointment for a specific lead (URL carries lead_id)
@WA_AUTO_BP.route("/api/wa-auto/leads/<path:user_email>/<lead_id>/appointments", methods=["POST"])
def add_wa_auto_lead_appointment(user_email, lead_id):
    """
    Same flexible inputs as the global endpoint. lead_id is taken from the URL.
    Accepts JSON, query, form, or pending_id.
    """
    user_email = (user_email or "").lower()
    lead_id = lead_id or ""
    b = request.get_json(force=True) or {}

    # 1) JSON extraction
    when = _extract_when_from_body(b)

    # 2) Query string fallback
    if not when:
        for k in ["appointment_time", "when", "start", "start_time", "proposed_time", "time"]:
            v = request.args.get(k)
            if v:
                when = v.strip()
                break

    # 3) Form-data fallback
    if not when and request.form:
        for k in ["appointment_time", "when", "start", "start_time", "proposed_time", "time"]:
            v = request.form.get(k)
            if v:
                when = v.strip()
                break

    # 4) pending_id fallback
    pending_id = b.get("pending_id") or request.args.get("pending_id") or (request.form.get("pending_id") if request.form else None)
    if not when and pending_id:
        sug = _find_pending_by_id(user_email, pending_id)
        if not sug:
            return jsonify({"ok": False, "error": "pending_not_found"}), 404
        when = sug.get("suggested_time")

    if not when:
        return jsonify({"ok": False, "error": "missing_time",
                        "hint": "Send appointment_time (ISO) in JSON, query, or form, or include pending_id"}), 400

    appt = {
        "id": "apt_" + str(uuid.uuid4())[:8],
        "created_at": _now_iso(),
        "appointment_time": when,
        "duration": int(b.get("duration") or 30),
        "appointment_location": b.get("appointment_location") or "TBD",
        "notes": b.get("notes") or "",
        "lead_id": lead_id,
        "lead_first_name": b.get("lead_first_name") or "",
        "lead_email": b.get("lead_email") or "",
        "business_name": b.get("business_name") or "Your Business",
    }
    _add_appointment(user_email, appt)
    _notify(user_email, "Appointment added", f"{appt['lead_first_name']} • {appt['appointment_time']}")
    return jsonify({"ok": True, "appointment": appt})

# Mark done (lead-scoped URL)
@WA_AUTO_BP.route("/api/wa-auto/leads/<path:user_email>/<lead_id>/appointments/<appt_id>/done", methods=["POST"])
def mark_wa_auto_lead_appointment_done(user_email, lead_id, appt_id):
    return mark_wa_auto_appointment_done(user_email, appt_id)

# Delete (lead-scoped URL)
@WA_AUTO_BP.route("/api/wa-auto/leads/<path:user_email>/<lead_id>/appointments/<appt_id>", methods=["DELETE"])
def delete_wa_auto_lead_appointment(user_email, lead_id, appt_id):
    return delete_wa_auto_appointment(user_email, appt_id)
