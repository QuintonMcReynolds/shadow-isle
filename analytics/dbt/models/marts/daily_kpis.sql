-- Live-ops view: activity per day.
select
    started_at::date                                       as day,
    bool_or(is_bot)                                        as includes_bots,
    count(distinct player_id)                              as players,
    count(distinct case when session_number = 1 then player_id end) as new_players,
    count(*)                                               as sessions,
    sum(runs)                                              as runs,
    sum(playtime_s) / 60                                   as play_minutes
from {{ ref('fct_sessions') }}
group by day, is_bot
order by day
