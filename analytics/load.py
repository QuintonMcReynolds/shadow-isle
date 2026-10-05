"""Load telemetry into the local DuckDB warehouse (raw.events).

Sources (all optional, combined, de-duplicated on event_id downstream):
  * data/raw/*.jsonl            local dev collector and test bots
  * Supabase (real players)     needs SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment
                                (service-role key: read access; keep it out of the game and git)

    python analytics/load.py            # local files only
    python analytics/load.py --supabase # also pull real players from Supabase
"""

import argparse
import json
import os
from pathlib import Path

import duckdb
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
DB = ROOT / "data" / "warehouse.duckdb"
COLS = ["event_id", "player_id", "session_id", "event", "seq", "client_ts", "experiment_id",
        "variant", "game_version", "is_bot", "props", "source"]


def pull_supabase(page: int = 1000) -> list[dict]:
    import requests

    url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/events"
    key = os.environ["SUPABASE_SERVICE_KEY"]
    headers = {"apikey": key}
    if not key.startswith("sb_"):  # legacy service_role JWT; new sb_secret_ keys go in apikey only
        headers["Authorization"] = f"Bearer {key}"
    rows, start = [], 0
    while True:
        r = requests.get(url, headers={**headers, "Range": f"{start}-{start + page - 1}"},
                         params={"select": "*", "order": "id"}, timeout=60)
        r.raise_for_status()
        batch = r.json()
        rows += batch
        if len(batch) < page:
            return rows
        start += page


def main(supabase: bool = False) -> None:
    rows = []
    for f in sorted(RAW.glob("*.jsonl")):
        for line in f.open():
            if line.strip():
                rows.append({**json.loads(line), "source": f.stem})
    if supabase:
        live = pull_supabase()
        (RAW / "supabase_snapshot.json").write_text(json.dumps(live))
        # the table also holds other games (supabase/002_last_lighthouse.sql); keep Shadow Isle only
        rows += [{**r, "source": "supabase"} for r in live if r.get("game", "shadow_isle") == "shadow_isle"]
    df = pd.DataFrame(rows).reindex(columns=COLS)
    df["props"] = df["props"].map(lambda p: json.dumps(p if isinstance(p, dict) else {}))
    DB.parent.mkdir(parents=True, exist_ok=True)
    with duckdb.connect(str(DB)) as con:
        con.execute("CREATE SCHEMA IF NOT EXISTS raw")
        con.register("df", df)
        con.execute("CREATE OR REPLACE TABLE raw.events AS SELECT * FROM df")
        n = con.execute("SELECT count(*), count(DISTINCT player_id) FROM raw.events").fetchone()
    print(f"raw.events: {n[0]:,} rows, {n[1]:,} players "
          f"({', '.join(sorted(df['source'].unique())) if len(df) else 'no sources'})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--supabase", action="store_true")
    main(ap.parse_args().supabase)
