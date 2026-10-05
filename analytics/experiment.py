"""Pre-registered readout for exp1_gentle_start (docs/analysis_plan.md).

    python analytics/experiment.py              # real players only
    python analytics/experiment.py --bots       # dry run on simulated players (pipeline test)
"""

import argparse
import json
from pathlib import Path

import duckdb
import pandas as pd
import stats as st

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "warehouse.duckdb"
A, B = "standard", "gentle_start"


def main(bots: bool) -> dict:
    with duckdb.connect(str(DB), read_only=True, config={"TimeZone": "UTC"}) as con:
        df = con.execute(f"""
            SELECT * FROM main.exp_player_metrics WHERE is_bot = {str(bots).lower()}
        """).df()
        data_end = con.execute("SELECT max(client_ts) FROM main.stg_events").fetchone()[0]
    excl = {line.strip() for line in (ROOT / "analytics" / "exclude_players.txt").open()
            if line.strip() and not line.startswith("#")}
    df = df[~df.player_id.isin(excl)]
    out_dir = ROOT / "reports" / ("dry_run_bots" if bots else "live")
    out_dir.mkdir(parents=True, exist_ok=True)
    res = {"population": "simulated bots (pipeline test, NOT evidence)" if bots else "real players",
           "players": len(df), "data_end": str(data_end)}
    if df.empty:
        res["status"] = "no exposed players yet"
        (out_dir / "experiment.json").write_text(json.dumps(res, indent=2))
        print(res)
        return res
    a, b = df[df.variant == A], df[df.variant == B]
    res["n"] = {A: len(a), B: len(b)}
    res["srm_p"] = st.srm_p(len(a), len(b))

    # primary
    res["primary"] = {"metric": "first-session play time (s), ratio of geometric means B/A",
                      **st.log_ratio(a.first_session_playtime_s.fillna(0).to_numpy(),
                                     b.first_session_playtime_s.fillna(0).to_numpy())}
    # secondaries (Holm-adjusted together)
    sec = {
        "played_second_run": st.proportion(int(a.played_second_run.sum()), len(a),
                                           int(b.played_second_run.sum()), len(b)),
        "first_session_runs": st.mean_diff(a.first_session_runs.to_numpy(float),
                                           b.first_session_runs.to_numpy(float)),
        "returned_d1": st.proportion(int(a.returned_d1.sum()), len(a),
                                     int(b.returned_d1.sum()), len(b)),
    }
    # D7 only for players who could have come back (first seen > 8 days before data end)
    ripe = df[df.first_seen < (pd.Timestamp(data_end) - pd.Timedelta(days=8))]
    ra, rb = ripe[ripe.variant == A], ripe[ripe.variant == B]
    if len(ra) >= 10 and len(rb) >= 10:
        sec["returned_d7"] = st.proportion(int(ra.returned_d7.sum()), len(ra),
                                           int(rb.returned_d7.sum()), len(rb))
    adj = st.holm([v["p"] for v in sec.values()])
    for v, p in zip(sec.values(), adj):
        v["p_holm"] = p
    res["secondary"] = sec
    # manipulation check: the gentle start should make first runs longer
    res["manipulation_check"] = {
        "first_run_duration_s": st.mean_diff(a.first_run_duration_s.dropna().to_numpy(),
                                             b.first_run_duration_s.dropna().to_numpy()),
        "first_shadow_s_median": {A: float(a.first_run_first_shadow_s.median()),
                                  B: float(b.first_run_first_shadow_s.median())},
    }
    sd = res["primary"]["sd_log"]
    res["mde_now"] = {"ratio": st.mde_log(sd, min(len(a), len(b)))}
    (out_dir / "experiment.json").write_text(json.dumps(res, indent=2, default=float))
    print(json.dumps(res, indent=2, default=float))
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--bots", action="store_true")
    main(ap.parse_args().bots)
