#!/usr/bin/env python3
import os
from dotenv import load_dotenv

# Load .env so STRIPE_* keys become available
load_dotenv()

import sys
sys.path.insert(0, os.path.dirname(__file__))

import stripe
from app import load_users, save_users

# ─── CONFIG ─────────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY        = os.getenv("STRIPE_SECRET_KEY")
STRIPE_CONNECT_CLIENT_ID = os.getenv("STRIPE_CONNECT_CLIENT_ID")
if not STRIPE_SECRET_KEY or not STRIPE_CONNECT_CLIENT_ID:
    print("ERROR: Please set STRIPE_SECRET_KEY and STRIPE_CONNECT_CLIENT_ID in your .env")
    exit(1)
stripe.api_key = STRIPE_SECRET_KEY
# ────────────────────────────────────────────────────────────────────────────────

def main():
    print("🔍 Fetching up to 100 connected accounts…")
    try:
        accounts = stripe.Account.list(limit=100)
    except Exception as e:
        print(f"⚠️  Failed to list accounts: {e}")
        return

    count = 0
    for acct in accounts.auto_paging_iter():
        if acct.type != "express":
            continue
        count += 1
        try:
            stripe.OAuth.deauthorize(
                client_id      = STRIPE_CONNECT_CLIENT_ID,
                stripe_user_id = acct.id
            )
            print(f"✅ Deauthorized Express account {acct.id}")
        except Exception as e:
            print(f"❌ Failed to deauthorize {acct.id}: {e}")

    if count == 0:
        print("ℹ️  No Express accounts found to deauthorize.")
    else:
        print(f"🎉 Done! Deauthorized {count} Express account(s).")

if __name__ == "__main__":
    main()
