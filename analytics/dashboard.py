"""Live-ops dashboard: one self-contained HTML page from the warehouse.

    python analytics/dashboard.py            # real players  -> reports/live/dashboard.html
    python analytics/dashboard.py --bots     # bot dry run   -> reports/dry_run_bots/dashboard.html
"""

import argparse
import html
import io
import json
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "warehouse.duckdb"
BLUE, RED, MUTED, INK = "#4fa8ff", "#aa0a19", "#8c96c8", "#e8e9f3"


def svg(fig) -> str:
    buf = io.StringIO()
    fig.savefig(buf, format="svg", transparent=True, bbox_inches="tight")
    plt.close(fig)
    s = buf.getvalue()
    return s[s.index("<svg"):]


def axes(ax):
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(MUTED)
    ax.tick_params(colors=MUTED)
    ax.xaxis.label.set_color(MUTED)
    ax.yaxis.label.set_color(MUTED)
    ax.grid(color=MUTED, alpha=0.2)


def main(bots: bool):
    flag = str(bots).lower()
    with duckdb.connect(str(DB), read_only=True, config={"TimeZone": "UTC"}) as con:
        def q(sql):
            return con.execute(sql).df()
        kpi = q(f"""SELECT count(*) players, sum(runs) runs, sum(playtime_s)/3600 AS hours_played,
                     avg(returned_d1) d1, max(best_score) top FROM main.dim_players WHERE is_bot={flag}""").iloc[0]
        runs = q(f"SELECT * FROM main.fct_runs WHERE is_bot={flag}")
        daily = q(f"SELECT * FROM main.daily_kpis WHERE includes_bots={flag} ORDER BY day")
    out_dir = ROOT / "reports" / ("dry_run_bots" if bots else "live")
    out_dir.mkdir(parents=True, exist_ok=True)
    exp_path = out_dir / "experiment.json"
    exp = json.loads(exp_path.read_text()) if exp_path.exists() else {}

    charts = {}
    if len(daily):
        fig, ax = plt.subplots(figsize=(6, 2.4))
        ax.bar(daily["day"], daily["players"], color=BLUE, width=0.8, label="players")
        ax.bar(daily["day"], daily["new_players"], color=RED, width=0.5, label="new")
        ax.legend(frameon=False, labelcolor=INK)
        axes(ax)
        fig.autofmt_xdate()
        charts["Players per day"] = svg(fig)
    if len(runs):
        fig, ax = plt.subplots(figsize=(6, 2.4))
        bins = np.linspace(0, max(60, runs.duration_s.quantile(0.98)), 30)
        for v, c in (("standard", MUTED), ("gentle_start", BLUE)):
            d = runs[runs.variant == v].duration_s
            ax.hist(d, bins=bins, color=c, alpha=0.75, label=f"{v} (median {d.median():.0f}s)")
        ax.set_xlabel("run length (s)")
        ax.legend(frameon=False, labelcolor=INK)
        axes(ax)
        charts["Run length by arm"] = svg(fig)
        fig, ax = plt.subplots(figsize=(6, 3.4))
        ax.set_facecolor("#0b0d1f")
        for cause, c in (("caught", RED), ("fell", BLUE)):
            d = runs[runs.cause == cause]
            ax.scatter(d.death_x, d.death_y, s=8, color=c, alpha=0.45, label=cause, linewidths=0)
        ax.set_xlim(0, 320)
        ax.set_ylim(180, 0)
        ax.set_aspect("equal")
        ax.set_xticks([])
        ax.set_yticks([])
        ax.legend(frameon=False, labelcolor=INK, loc="upper right")
        charts["Where Cuetip goes down (island coordinates)"] = svg(fig)

    tiles = [("Players", f"{int(kpi.players or 0):,}"), ("Runs", f"{int(kpi.runs or 0):,}"),
             ("Hours played", f"{(kpi.hours_played or 0):.1f}"),
             ("Came back next day", f"{(kpi.d1 or 0):.0%}"), ("Top score", f"{int(kpi.top or 0):,}")]
    exp_html = "<p>No experiment readout yet: run <code>analytics/experiment.py</code>.</p>"
    if exp.get("primary"):
        p = exp["primary"]
        rows = [("Exposed players", f"{exp['n']['standard']} standard / {exp['n']['gentle_start']} gentle start"),
                ("Sample-ratio check", f"p = {exp['srm_p']:.2f}" + (" ⚠ investigate" if exp['srm_p'] < 0.01 else " ✓")),
                ("First-session play time, gentle ÷ standard",
                 f"{p['ratio']:.2f}× (95% CI {p['ci95'][0]:.2f}–{p['ci95'][1]:.2f}), p = {p['p']:.3f}"),
                ("P(gentle start is better)", f"{p['prob_b_better']:.0%}"),
                ("Smallest effect detectable now", f"{exp['mde_now']['ratio']:.2f}×")]
        for k, v in exp["secondary"].items():
            rows.append((k.replace("_", " "), (f"{v['diff']:+.3f} (95% CI {v['ci95'][0]:+.3f} to "
                                               f"{v['ci95'][1]:+.3f}), Holm p = {v['p_holm']:.2f}")))
        exp_html = "<table>" + "".join(f"<tr><th>{html.escape(a)}</th><td>{html.escape(b)}</td></tr>"
                                       for a, b in rows) + "</table>"
    banner = ('<div class="banner">SIMULATED BOT DATA: tests the pipeline, says nothing about '
              'real players.</div>' if bots else "")
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Shadow Isle Live Ops</title>
<style>
:root{{--bg:#05060f;--card:#0f1226;--ink:#e8e9f3;--ink2:#8c96c8;--red:#aa0a19;--line:#22264a}}
body{{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,"Segoe UI",Roboto,sans-serif}}
main{{max-width:1040px;margin:0 auto;padding:24px 16px 48px}}
h1{{margin:0;font-size:22px}} h2{{font-size:15px;margin:28px 0 8px;color:var(--ink2);text-transform:uppercase;letter-spacing:.06em}}
.sub{{color:var(--ink2);margin:4px 0 16px}}
.tiles{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}}
.tile,.card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}}
.tile .k{{color:var(--ink2);font-size:12px}} .tile .v{{font-size:24px;font-weight:600}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:10px}}
.card svg{{width:100%;height:auto}} .card h3{{margin:0 0 6px;font-size:13px}}
table{{border-collapse:collapse;width:100%}} th,td{{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}}
th{{color:var(--ink2);font-weight:500;width:45%}}
.banner{{background:var(--red);color:#fff;padding:8px 12px;border-radius:8px;margin-bottom:12px;font-weight:600}}
</style></head><body><main>{banner}
<h1>Shadow Isle: live ops</h1>
<p class="sub">CuetipLLC · experiment exp1_gentle_start · generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC</p>
<div class="tiles">{''.join(f'<div class="tile"><div class="k">{k}</div><div class="v">{v}</div></div>' for k, v in tiles)}</div>
<h2>Activity</h2><div class="grid">{''.join(f'<div class="card"><h3>{k}</h3>{v}</div>' for k, v in charts.items())}</div>
<h2>Experiment readout (pre-registered)</h2><div class="card">{exp_html}</div>
</main></body></html>"""
    (out_dir / "dashboard.html").write_text(page)
    print("wrote", (out_dir / "dashboard.html").relative_to(ROOT))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--bots", action="store_true")
    main(ap.parse_args().bots)
