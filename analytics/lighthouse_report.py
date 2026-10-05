"""Cuetip and the Last Lighthouse: puzzle funnel and hint-nudge experiment readout.

    python analytics/lighthouse_report.py           # real players from Supabase (reads .env)
    python analytics/lighthouse_report.py --local   # data/raw/lighthouse/events.jsonl (make lh-dev)

Unit: player. Primary metric: finished the game (game_complete) in any session.
Arms: standard (hint button only) vs nudge (Cuetip also thinks out loud after 75 s stuck).
"""

import argparse
import json
import math
import os
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
STEPS = ["net", "rope", "key", "gate", "lantern", "fish", "oil", "lantern_oil",
         "lantern_lit", "shadow", "lens", "lamp_lens", "lamp_oil", "lamp_lit"]


def env(name: str) -> str:
    if name not in os.environ and (ROOT / ".env").exists():
        for line in (ROOT / ".env").read_text().splitlines():
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())
    return os.environ[name]


def pull_supabase(page: int = 1000) -> list[dict]:
    key = env("SUPABASE_SERVICE_KEY")
    headers = {"apikey": key, **({} if key.startswith("sb_") else {"Authorization": f"Bearer {key}"})}
    url = env("SUPABASE_URL").rstrip("/") + "/rest/v1/events"
    rows, start = [], 0
    while True:
        r = requests.get(url, headers={**headers, "Range": f"{start}-{start + page - 1}"},
                         params={"select": "*", "order": "id", "game": "eq.last_lighthouse",
                                 "is_bot": "eq.false"}, timeout=60)
        r.raise_for_status()
        rows += r.json()
        if len(r.json()) < page:
            return rows
        start += page


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


def players(ev: pd.DataFrame) -> pd.DataFrame:
    solved = ev[ev.event == "puzzle_solved"].assign(step=lambda d: d.props.map(lambda p: p.get("step")))
    done = ev[ev.event == "game_complete"]
    hints = ev[ev.event == "hint_used"].assign(auto=lambda d: d.props.map(lambda p: bool(p.get("auto"))))
    out = ev.groupby("player_id").agg(variant=("variant", "first"), sessions=("session_id", "nunique"))
    out["started"] = ev[ev.event == "game_start"].groupby("player_id").size().reindex(out.index).fillna(0) > 0
    out["steps"] = solved.groupby("player_id").step.nunique().reindex(out.index).fillna(0).astype(int)
    out["finished"] = out.index.isin(done.player_id)
    out["finish_s"] = done.groupby("player_id").props.first().map(lambda p: p.get("t")).reindex(out.index)
    out["hints"] = hints[~hints.auto].groupby("player_id").size().reindex(out.index).fillna(0).astype(int)
    out["nudges"] = hints[hints.auto].groupby("player_id").size().reindex(out.index).fillna(0).astype(int)
    for s in STEPS:
        out["s_" + s] = out.index.isin(solved[solved.step == s].player_id)
    return out


def main(local: bool) -> None:
    if local:
        f = ROOT / "data" / "raw" / "lighthouse" / "events.jsonl"
        rows = [json.loads(line) for line in f.open() if line.strip()] if f.exists() else []
    else:
        rows = pull_supabase()
    excl = {line.split("#")[0].strip() for line in (ROOT / "analytics" / "exclude_players.txt").open()} - {""}
    ev = pd.DataFrame(rows)
    if ev.empty:
        print("No Last Lighthouse events yet.")
        return
    ev = ev[~ev.player_id.isin(excl)]
    p = players(ev)
    p = p[p.started]
    print(f"Last Lighthouse: {len(p)} players who started the game "
          f"({len(excl)} excluded ids, {'local' if local else 'Supabase'})\n")
    if p.empty:
        return

    counts = p.variant.value_counts()
    print("Players per arm:", ", ".join(f"{k} {v}" for k, v in counts.items()))
    if len(counts) == 2:  # sample ratio check: 50/50 expected
        n, k = counts.sum(), counts.iloc[0]
        z = (k - n / 2) / math.sqrt(n / 4)
        flag = "  <-- assignment looks off" if abs(z) > 3 else "  (fine)"
        print(f"  sample ratio check: z = {z:+.2f}{flag}")

    print("\nFunnel (share of starters who solved each step):")
    arms = sorted(p.variant.unique())
    print(f"  {'step':<12}" + "".join(f"{a:>12}" for a in ["all", *arms]))
    for s in STEPS:
        cells = [p["s_" + s].mean()] + [p[p.variant == a]["s_" + s].mean() for a in arms]
        print(f"  {s:<12}" + "".join(f"{c:>11.0%} " for c in cells))

    print("\nPrimary metric: finished the game")
    rates = {}
    for a in arms:
        g = p[p.variant == a]
        k, n = int(g.finished.sum()), len(g)
        lo, hi = wilson(k, n)
        rates[a] = (k, n)
        med = g.finish_s.median()
        print(f"  {a:<10} {k}/{n} = {k / n:.0%}  (95% CI {lo:.0%} to {hi:.0%})"
              f"   median time {'-' if pd.isna(med) else f'{med / 60:.1f} min'}"
              f"   hints/player {g.hints.mean():.1f}   nudges/player {g.nudges.mean():.1f}")
    if set(rates) == {"standard", "nudge"}:
        (k1, n1), (k0, n0) = rates["nudge"], rates["standard"]
        p1, p0 = k1 / n1, k0 / n0
        se = math.sqrt(p1 * (1 - p1) / n1 + p0 * (1 - p0) / n0) or float("nan")
        d = p1 - p0
        print(f"  nudge - standard: {d:+.0%} (95% CI {d - 1.96 * se:+.0%} to {d + 1.96 * se:+.0%})")
        if min(n1, n0) < 100:
            print("  (fewer than 100 players per arm: treat this as a direction, not a result)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", action="store_true")
    main(ap.parse_args().local)
