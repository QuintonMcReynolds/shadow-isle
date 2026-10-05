-- One row per finished run (including runs abandoned by closing the tab: cause = 'quit').
select
    e.event_id                                   as run_id,
    e.player_id,
    e.session_id,
    e.variant,
    e.is_bot,
    e.client_ts                                  as ended_at,
    (e.props ->> '$.duration_s')::double         as duration_s,
    (e.props ->> '$.score')::int                 as score,
    (e.props ->> '$.shards')::int                as shards,
    (e.props ->> '$.escapes')::int               as escapes,
    (e.props ->> '$.island')::int                as island,
    e.props ->> '$.cause'                        as cause,
    (e.props ->> '$.dashes')::int                as dashes,
    (e.props ->> '$.max_shadows')::int           as max_shadows,
    (e.props ->> '$.tiles_lost')::int            as tiles_lost,
    (e.props ->> '$.first_shadow_s')::double     as first_shadow_s,
    (e.props ->> '$.death_x')::int               as death_x,
    (e.props ->> '$.death_y')::int               as death_y,
    e.props ->> '$.input'                        as input,
    row_number() over (partition by e.player_id order by e.client_ts, e.seq) as run_number
from {{ ref('stg_events') }} e
where e.event = 'run_end'
