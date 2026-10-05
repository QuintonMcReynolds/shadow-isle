# Analysis plan: exp1_gentle_start

*Written and committed before any real player data was collected. The git history is the
timestamp. Changes after launch go in the "Deviations" section at the bottom, never in place.*

## Question

Does making the first ~30 seconds of each run gentler keep new players playing longer?

Arcade survival games lose most players in the first minute. A soft start might help
them learn the controls before the game gets hard, or it might make the opening boring and
change nothing.

## Design

| | |
|---|---|
| Unit | Player (anonymous id stored in the browser) |
| Assignment | `hash(player_id + "exp1_gentle_start") mod 2`, sticky across sessions (`game/telemetry.js`) |
| Arms | **standard**: first shadow at 2.5 s, crumbling at 12 s<br>**gentle_start**: first shadow at 7 s, crumbling at 18 s, shadows at 55% speed and spawning 1.8× slower until 20 s, then ramping to standard by 35 s |
| Exposure | First `run_start` of a player's first session (`exposure` event) |
| Population | Everyone who starts a run on the itch.io build, excluding bots (`is_bot`) and opted-out players (who send nothing) |
| Duration | Until **200 exposed players**, or **6 weeks** after launch, whichever comes first. No early stopping on significance. |

## Metrics

**Primary:** first-session play time, the sum of run durations in the player's first
session. Compared as the ratio of geometric means of (seconds + 1), gentle / standard.
Test: Welch t-test on log(seconds + 1), two-sided, α = 0.05. A 95% bootstrap CI and
P(gentle better) under a flat prior are reported alongside.

**Secondary** (Holm-adjusted as a family):
1. Played a second run in the first session (yes/no)
2. Runs in the first session (mean)
3. Came back on a later day within 1 day (D1)
4. Came back within 7 days (D7). Only players first seen 8+ days before the data cut.

**Manipulation check** (must move, or the treatment didn't happen): first-run duration
and time to first shadow.

**Guardrail:** client error rate, and runs ending as `quit` (tab closed mid-run).

## Power

Play time is very skewed. The standard deviation of log(seconds + 1) is unknown before
launch: simulated players show 0.73, and real engagement data is usually around 1.0.
Minimum detectable effects at 80% power, α = 0.05:

| Players per arm | Play time (sd 0.75) | Play time (sd 1.0) | Second-run rate (base 60%) |
|---|---|---|---|
| 50 | +52% | +75% | ±27 pts |
| 100 | +35% | +49% | ±19 pts |
| 150 | +27% | +38% | ±16 pts |
| 250 | +21% | +28% | ±12 pts |
| 400 | +16% | +22% | ±10 pts |

At the realistic target of ~100 players per arm, this test can detect a large effect
(~35–50% more play time), not a subtle one. **A null result at this size means "no large
effect", not "no effect".** The readout will say exactly that, with the CI.

## Data quality checks (run before reading results)

- Sample-ratio mismatch: exact binomial test of arm sizes vs 50/50. If p < 0.01, stop and
  debug before reading any metric.
- No player in two arms (dbt test `one_variant_per_player`).
- Every finished run has a start (dbt test `runs_have_starts`).
- Bot and test traffic excluded (`is_bot = false`; my own playtest ids listed in
  `analytics/exclude_players.txt`).

## Deviations

*(none yet)*
