-- One row per session. Play time = sum of run durations (doesn't depend on session_end,
-- which is lost when a browser is killed).
with s as (
    select player_id, session_id, any_value(variant) as variant, bool_or(is_bot) as is_bot,
           min(client_ts) as started_at, max(client_ts) as last_event_at,
           max(case when event = 'session_end' then 1 else 0 end) as clean_exit
    from {{ ref('stg_events') }}
    group by player_id, session_id
),
r as (
    select session_id, count(*) as runs, sum(duration_s) as playtime_s,
           max(score) as best_score, sum(case when cause = 'quit' then 1 else 0 end) as quit_runs
    from {{ ref('fct_runs') }} group by session_id
)
select s.*,
    coalesce(r.runs, 0)        as runs,
    coalesce(r.playtime_s, 0)  as playtime_s,
    r.best_score,
    coalesce(r.quit_runs, 0)   as quit_runs,
    row_number() over (partition by s.player_id order by s.started_at) as session_number
from s left join r using (session_id)
