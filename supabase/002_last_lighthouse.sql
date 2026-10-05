-- Second game in the same table: Cuetip and the Last Lighthouse
-- (github.com/QuintonMcReynolds/last-lighthouse, which keeps its own copy as supabase/setup.sql).
-- Run once after schema.sql: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- * a game column; existing rows (and Shadow Isle builds, which don't send it) are 'shadow_isle'
-- * the event-name and variant allow-lists grow to cover the new game

alter table public.events
  add column if not exists game text not null default 'shadow_isle';

do $$
declare c record;
begin
  -- drop the old allow-lists, whatever Postgres named them
  for c in
    select conname from pg_constraint
    where conrelid = 'public.events'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) like '%(event = ANY%'
        or pg_get_constraintdef(oid) like '%(variant = ANY%'
        or pg_get_constraintdef(oid) like '%(game = ANY%')
  loop
    execute format('alter table public.events drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.events add constraint events_game_check
  check (game in ('shadow_isle', 'last_lighthouse'));

alter table public.events add constraint events_event_check check (event in (
  -- both games
  'session_start', 'exposure', 'session_end', 'client_error',
  -- Shadow Isle
  'run_start', 'run_end', 'escape',
  -- Last Lighthouse
  'game_start', 'scene_enter', 'puzzle_solved', 'hint_used', 'game_complete'));

alter table public.events add constraint events_variant_check
  check (variant in ('standard', 'gentle_start', 'nudge'));

create index if not exists events_game_idx on public.events (game);
