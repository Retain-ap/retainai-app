# backend/app_team.py
import os, json, time, secrets
from flask import Blueprint, request, jsonify
from urllib.parse import urljoin

team_bp = Blueprint("team_bp", __name__)

USERS_FILE    = "users.json"
INVITES_FILE  = "invites.json"
FRONTEND_BASE = os.getenv("FRONTEND_BASE", "http://localhost:3000")

# ─────────────── helpers ───────────────
def _load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def _save_json(path, data):
    # write whole file, preserving anything we don't touch
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def _norm(email: str) -> str:
    return (email or "").strip().lower()

def _user_key(email: str) -> str:
    return f"user::{_norm(email)}"

def _current_user_email() -> str:
    return _norm(request.headers.get("X-User-Email", ""))

def _users():
    return _load_json(USERS_FILE, {})

def _save_users(data):
    _save_json(USERS_FILE, data)

def _invites():
    return _load_json(INVITES_FILE, {})

def _save_invites(data):
    _save_json(INVITES_FILE, data)

def _get_any_user_view(users_dict: dict, email: str):
    """
    Compatibility read:
    - Prefer team record 'user::<email>'
    - Fallback to legacy top-level '<email>' object (your current format)
    """
    key = _user_key(email)
    return users_dict.get(key) or users_dict.get(email)

def _bootstrap_owner_if_missing(users_dict: dict, email: str) -> dict:
    """
    If the owner calls the API but there's no 'user::<email>' entry yet,
    create it based on the existing legacy record (or bare minimum).
    """
    key = _user_key(email)
    if key in users_dict:
        return users_dict  # already bootstrapped

    legacy = users_dict.get(email) or {}
    users_dict[key] = {
        "email": email,
        "name": legacy.get("name") or legacy.get("business") or "",
        "role": "owner",
        "org_id": legacy.get("org_id") or email,  # single-tenant org by default
        "last_login": legacy.get("last_login"),
    }
    _save_users(users_dict)
    return users_dict

def _iter_team_members(users_dict: dict, org_id: str):
    """
    Yield team members from 'user::' namespace only.
    If none exist yet, yield just the owner view (compatibility).
    """
    had_any = False
    for k, v in users_dict.items():
        if not isinstance(k, str) or not k.startswith("user::"):
            continue
        if (v.get("org_id") or v.get("email")) == org_id:
            had_any = True
            yield {
                "email": v.get("email"),
                "name": v.get("name") or "",
                "role": v.get("role", "member"),
                "last_login": v.get("last_login"),
            }
    if not had_any:
        # Compat: return a single owner row if no team records yet
        owner = users_dict.get(_user_key(org_id)) or users_dict.get(org_id) or {"email": org_id}
        yield {
            "email": owner.get("email", org_id),
            "name": owner.get("name") or "",
            "role": owner.get("role", "owner"),
            "last_login": owner.get("last_login"),
        }

# ─────────────── routes ───────────────
@team_bp.route("/api/team/members", methods=["GET"])
def team_members():
    me = _current_user_email()
    if not me:
        return jsonify({"error": "auth"}), 401

    users = _users()
    # Ensure the caller has a canonical team record
    users = _bootstrap_owner_if_missing(users, me)

    me_user = _get_any_user_view(users, me)
    if not me_user:
        return jsonify({"error": "no_user"}), 404

    org_id = me_user.get("org_id") or me
    out = list(_iter_team_members(users, org_id))
    return jsonify({"members": out})

@team_bp.route("/api/team/invite", methods=["POST"])
def invite_member():
    me = _current_user_email()
    if not me:
        return jsonify({"error":"auth"}), 401

    users = _users()
    # Ensure owner exists in team namespace (auto once)
    users = _bootstrap_owner_if_missing(users, me)

    me_user = _get_any_user_view(users, me)
    if not me_user:
        return jsonify({"error":"no_user"}), 404
    if me_user.get("role", "owner") != "owner":
        return jsonify({"error":"forbidden"}), 403

    body  = request.get_json() or {}
    email = _norm(body.get("email"))
    role  = (body.get("role") or "member").lower()
    if not email:
        return jsonify({"error":"email_required"}), 400

    org_id = me_user.get("org_id") or me_user.get("email") or me

    # already a member in team namespace?
    existing_member = users.get(_user_key(email))
    if existing_member and (existing_member.get("org_id") or existing_member.get("email")) == org_id:
        return jsonify({"error": "already_member"}), 409

    # pending invite?
    invites = _invites()
    now = int(time.time())
    for t, inv in invites.items():
        if inv.get("accepted_at"):
            continue
        if _norm(inv.get("email")) == email and inv.get("org_id") == org_id and inv.get("expires_at", 0) > now:
            accept_url = urljoin(FRONTEND_BASE, f"/accept-invite?token={t}")
            return jsonify({"ok": True, "token": t, "accept_url": accept_url, "existing": True})

    # create new invite
    token = secrets.token_urlsafe(24)
    invites[token] = {
        "email": email,
        "role": role,
        "org_id": org_id,
        "created_at": now,
        "expires_at": now + 7*24*3600,
        "accepted_at": None
    }
    _save_invites(invites)

    accept_url = urljoin(FRONTEND_BASE, f"/accept-invite?token={token}")
    # (Optionally send email/SMS here)
    return jsonify({"ok": True, "token": token, "accept_url": accept_url})

@team_bp.route("/api/team/invite/<token>", methods=["GET"])
def read_invite(token):
    invs = _invites()
    inv = invs.get(token)
    if not inv:
        return jsonify({"error":"not_found"}), 404
    if inv["expires_at"] < int(time.time()):
        return jsonify({"error":"expired"}), 410
    return jsonify({"invite": {"email": inv["email"], "role": inv["role"], "org_id": inv["org_id"]}})

@team_bp.route("/api/team/accept", methods=["POST"])
def accept_invite():
    body  = request.get_json() or {}
    token = body.get("token")
    name  = body.get("name") or ""
    email_input = _norm(body.get("email"))

    if not token or not email_input:
        return jsonify({"error":"bad_request"}), 400

    invites = _invites()
    inv = invites.get(token)
    if not inv:
        return jsonify({"error":"not_found"}), 404
    if inv["expires_at"] < int(time.time()):
        return jsonify({"error":"expired"}), 410
    if inv.get("accepted_at"):
        return jsonify({"error":"already_accepted"}), 409

    # must match invited email
    if _norm(inv["email"]) != email_input:
        return jsonify({"error":"email_mismatch", "invited": _norm(inv["email"])}), 400

    users = _users()

    # ensure owner exists (org owner might be first-time bootstrap)
    users = _bootstrap_owner_if_missing(users, inv.get("org_id"))

    # add/overwrite the member in team namespace only
    key = _user_key(email_input)
    users[key] = {
        "email": email_input,
        "name": name,
        "role": inv["role"],
        "org_id": inv["org_id"],
        "last_login": None
    }
    _save_users(users)

    inv["accepted_at"] = int(time.time())
    invites[token] = inv
    _save_invites(invites)

    return jsonify({"ok": True})
