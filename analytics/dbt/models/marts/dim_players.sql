-- One row per player: assignment, lifetime engagement, retention.
with sessions as (select * from {{ ref('fct_sessions') }}),
first as (
    select player_id, min(started_at) as first_seen
    from sessions group by player_id
)
select
    s.player_id,
    any_value(s.variant)                                    as variant,
    bool_or(s.is_bot)                                       as is_bot,
    f.first_seen,
    count(*)                                                as sessions,
    sum(s.runs)                                             as runs,
    sum(s.playtime_s)                                       as playtime_s,
    max(s.best_score)                                       as best_score,
    -- came back on a later calendar day (in UTC) within 1 / 7 days of the first session
    max(case when s.started_at::date > f.first_seen::date
              and s.started_at < f.first_seen + interval 2 day then 1 else 0 end) as returned_d1,
    max(case when s.started_at::date > f.first_seen::date
              and s.started_at < f.first_seen + interval 8 day then 1 else 0 end) as returned_d7
from sessions s join first f using (player_id)
group by s.player_id, f.first_seen
