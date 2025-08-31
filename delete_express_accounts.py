#!/usr/bin/env python3
import os
import stripe
import json
from dotenv import load_dotenv

# -----------------------------------------------------------------------------
# CONFIGURATION
# -----------------------------------------------------------------------------
load_dotenv()
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")        # e.g. sk_test_…
CLIENT_ID      = os.getenv("STRIPE_CONNECT_CLIENT_ID") # e.g. ca_…
USERS_FILE     = "users.json"

# -----------------------------------------------------------------------------
# HELPERS
# -----------------------------------------------------------------------------
def load_users():
    try:
        with open(USERS_FILE, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

def save_users(u):
    with open(USERS_FILE, "w") as f:
        json.dump(u, f, indent=2)

# -----------------------------------------------------------------------------
# MAIN
# -----------------------------------------------------------------------------
def main():
    if not stripe.api_key or not CLIENT_ID:
        print("❌ Make sure STRIPE_SECRET_KEY and STRIPE_CONNECT_CLIENT_ID are set in your .env")
        return

    print("🔍 Fetching up to 100 connected Express accounts…")
    try:
        accounts = stripe.Account.list(limit=100).data
    except Exception as e:
        print(f"❌ Failed to list accounts: {e}")
        return

    users   = load_users()
    removed = 0

    for acct in accounts:
        if acct.type != "express":
            continue

        acct_id = acct.id
        print(f"→ Processing {acct_id}…", end=" ")

        # 1) Try OAuth deauthorize (removes it from your dashboard)
        try:
            stripe.OAuth.deauthorize(
                client_id      = CLIENT_ID,
                stripe_user_id = acct_id
            )
            print("deauthorized ✅")
            removed += 1
        except Exception as de:
            msg = str(de)
            if "negative balances" in msg:
                # 2) Fallback: delete the account object outright
                print("deauth failed (negative balances), attempting delete…", end=" ")
                try:
                    stripe.Account.delete(acct_id)
                    print("deleted ✅")
                    removed += 1
                except Exception as dd:
                    print(f"delete failed ❌ ({dd})")
            else:
                print(f"deauth failed ❌ ({de})")
                continue

        # 3) Clean up users.json
        for email, data in list(users.items()):
            if data.get("stripe_account_id") == acct_id:
                data.pop("stripe_account_id", None)
                data.pop("stripe_connected",   None)
        save_users(users)

    print(f"\n🎉 Done. Removed {removed} account(s).")

if __name__ == "__main__":
    main()
