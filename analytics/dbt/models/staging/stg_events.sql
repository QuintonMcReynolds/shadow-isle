-- Typed, de-duplicated events. Retried uploads can deliver an event twice: keep one.
with ranked as (
    select *,
        row_number() over (partition by event_id order by source) as dup
    from {{ source('raw', 'events') }}
)
select
    event_id,
    player_id,
    session_id,
    event,
    seq::int                     as seq,
    client_ts::timestamptz       as client_ts,
    experiment_id,
    variant,
    game_version,
    is_bot::boolean              as is_bot,
    source,
    props::json                  as props
from ranked
where dup = 1
