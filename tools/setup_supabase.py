"""One-command Supabase setup.

    .venv/bin/python tools/setup_supabase.py

Asks for a Supabase personal access token (hidden input; create one at
https://supabase.com/dashboard/account/tokens), then:
  1. creates the events table + security rules (supabase/schema.sql)
  2. puts the public publishable key into game/config.js
  3. saves the secret key to .env (git-ignored, stays on this Mac)
  4. sends one test event as the real game would, confirms it arrived, and adds the test
     player id to analytics/exclude_players.txt so it never counts
The token is used only for this run and is not saved anywhere.
"""

import getpass
import json
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
REF = "fyrqmnfqpkeryzhquuef"
API = f"https://api.supabase.com/v1/projects/{REF}"
URL = f"https://{REF}.supabase.co"


def main():
    token = getpass.getpass("Paste your Supabase access token (it won't show), then Enter: ").strip()
    if not token:
        sys.exit("No token entered.")
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    r = requests.get(API, headers=h, timeout=30)
    if r.status_code != 200:
        sys.exit(f"Couldn't open project {REF} with that token ({r.status_code}): {r.text[:200]}")
    print(f"✓ Connected to project '{r.json().get('name', REF)}'")

    sql = (ROOT / "supabase" / "schema.sql").read_text()
    r = requests.post(f"{API}/database/query", headers=h, json={"query": sql}, timeout=60)
    if r.status_code >= 300:
        sys.exit(f"Creating the table failed ({r.status_code}): {r.text[:300]}")
    print("✓ events table and security rules created")

    r = requests.get(f"{API}/api-keys", headers=h, params={"reveal": "true"}, timeout=30)
    r.raise_for_status()
    keys = r.json()
    def pick(*names):
        for k in keys:
            if (k.get("type") in names or k.get("name") in names) and k.get("api_key"):
                return k["api_key"]
        return None
    public = pick("publishable", "anon")
    secret = pick("secret", "service_role")
    if not public or not secret:
        sys.exit(f"Couldn't find the project's API keys: {[k.get('name') for k in keys]}")

    cfg = ROOT / "game" / "config.js"
    text = re.sub(r'SUPABASE_ANON_KEY: "[^"]*"', f'SUPABASE_ANON_KEY: "{public}"', cfg.read_text())
    cfg.write_text(text)
    print("✓ publishable key written to game/config.js")

    env = ROOT / ".env"
    env.write_text(f"SUPABASE_URL={URL}\nSUPABASE_SERVICE_KEY={secret}\n")
    env.chmod(0o600)
    print("✓ secret key saved to .env (private, ignored by git)")

    # send a test event exactly the way the game does
    test_player = str(uuid.uuid4())
    row = {"event_id": str(uuid.uuid4()), "player_id": test_player, "session_id": str(uuid.uuid4()),
           "event": "session_start", "seq": 0, "client_ts": datetime.now(timezone.utc).isoformat(),
           "experiment_id": "exp1_gentle_start", "variant": "standard", "game_version": "setup-test",
           "is_bot": False, "props": {"setup_test": True}}
    gh = {"apikey": public, "Content-Type": "application/json", "Prefer": "return=minimal"}
    if not public.startswith("sb_"):
        gh["Authorization"] = f"Bearer {public}"
    r = requests.post(f"{URL}/rest/v1/events", headers=gh, data=json.dumps([row]), timeout=30)
    if r.status_code >= 300:
        sys.exit(f"Test event was rejected ({r.status_code}): {r.text[:300]}")
    # the public key must NOT be able to read
    r = requests.get(f"{URL}/rest/v1/events", headers=gh, params={"select": "event_id"}, timeout=30)
    leaked = r.status_code == 200 and r.json()
    q = f"select count(*) as n from public.events where player_id = '{test_player}'"
    n = requests.post(f"{API}/database/query", headers=h, json={"query": q}, timeout=30).json()[0]["n"]
    if n != 1:
        sys.exit(f"Test event not found in the table (found {n}).")
    print("✓ test event sent with the public key and found in the table")
    print("✓ the public key cannot read data" if not leaked
          else "⚠ the public key CAN read events: re-run supabase/schema.sql")

    excl = ROOT / "analytics" / "exclude_players.txt"
    with excl.open("a") as f:
        f.write(f"{test_player}  # setup test event\n")
    print("✓ test player excluded from results")
    print("\nAll set. Tell Claude: \"done\"")


if __name__ == "__main__":
    main()
