import requests
import json
from typing import List

# === HARD-CODED DEV CREDENTIALS (you asked to inline these) ===
ACCESS_TOKEN = "EAA4HyIGIVM4BPNb0oIBSxSSwNNsy2UyUMDr0I76NZAaurQzcWqVOCVGbf6KuTSJgh4LKzt0KkeGUQU42uAa0bG3x83JE7TnrPEa8mgMZAc7FIjaQeAgyXfVhTUj8f8EKxDml0YEznBK5ygfQDJjzGOAuxdZBC241jan5qYJBQafdBD6XbCAm3zwZCcxknDnYgnfb1l1yOHk9ZARcfJheZBiJ9jMYrAXZBAjXexlYK2i9mK6fZCQYS5RuHd0eojAjggZDZD"
PHONE_NUMBER_ID = "715884814938184"   # Your correct Phone Number ID
TO_NUMBER = "+12262014738"            # Your tester phone number (WhatsApp-registered)

GRAPH_BASE = f"https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages"
HEADERS = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Content-Type": "application/json",
}


def post(payload: dict):
    """Helper to POST and pretty-print the response."""
    r = requests.post(GRAPH_BASE, headers=HEADERS, json=payload, timeout=30)
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text}
    print(f"HTTP {r.status_code}")
    print(json.dumps(body, indent=2))
    return r.status_code, body


def send_template(name: str, lang: str = "en_US", variables: List[str] | None = None):
    """Send a template message (works without a 24h session)."""
    components = []
    if variables:
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": str(v)} for v in variables]
        })

    payload = {
        "messaging_product": "whatsapp",
        "to": TO_NUMBER,
        "type": "template",
        "template": {
            "name": name,
            "language": {"code": lang},
            **({"components": components} if components else {})
        }
    }
    print(f"\n== Sending TEMPLATE: {name} to {TO_NUMBER} ==")
    return post(payload)


def send_text(body: str):
    """Send a free-form text (only delivers if user messaged you in last 24h)."""
    payload = {
        "messaging_product": "whatsapp",
        "to": TO_NUMBER,
        "type": "text",
        "text": {"body": body},
    }
    print(f"\n== Sending TEXT to {TO_NUMBER} ==")
    return post(payload)


if __name__ == "__main__":
    # 1) Always try a template first (works without session)
    # The built-in 'hello_world' template should exist on dev/test setups.
    send_template("hello_world", "en_US")

    # 2) Then try a plain text (will only deliver if the 24h session is open)
    send_text("Hello from RetainAI! 🚀 If you see this, your session is open.")
