-- Assignment must be sticky: a player who shows up in both arms breaks the experiment.
select player_id, count(distinct variant) as arms
from {{ ref('stg_events') }}
where event <> 'client_error'
group by player_id
having count(distinct variant) > 1
