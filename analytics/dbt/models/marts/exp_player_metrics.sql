-- The experiment's analysis table: one row per exposed player, metrics from their FIRST
-- session (pre-registered; see docs/analysis_plan.md), plus retention.
with exposed as (
    select player_id, min(client_ts) as exposed_at, any_value(experiment_id) as experiment_id
    from {{ ref('stg_events') }} where event = 'exposure' group by player_id
),
first_session as (
    select * from {{ ref('fct_sessions') }} where session_number = 1
),
first_run as (
    select * from {{ ref('fct_runs') }} where run_number = 1
)
select
    p.player_id, p.variant, p.is_bot, e.experiment_id, e.exposed_at,
    fs.playtime_s          as first_session_playtime_s,
    fs.runs                as first_session_runs,
    (fs.runs >= 2)::int    as played_second_run,
    fs.best_score          as first_session_best_score,
    fr.duration_s          as first_run_duration_s,
    fr.cause               as first_run_cause,
    fr.first_shadow_s      as first_run_first_shadow_s,
    p.sessions, p.runs     as lifetime_runs,
    p.returned_d1, p.returned_d7, p.first_seen
from {{ ref('dim_players') }} p
join exposed e using (player_id)
left join first_session fs using (player_id)
left join first_run fr using (player_id)
