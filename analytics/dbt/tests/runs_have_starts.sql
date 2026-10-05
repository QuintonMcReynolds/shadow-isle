-- Every finished run must have been started in the same session (catches lost events).
select r.run_id
from {{ ref('fct_runs') }} r
left join (
    select session_id, count(*) as starts from {{ ref('stg_events') }}
    where event = 'run_start' group by session_id
) s using (session_id)
where s.starts is null
