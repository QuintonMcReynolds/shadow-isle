-- Shadow Isle telemetry table. Run once in Supabase: SQL Editor -> New query -> paste -> Run.
--
-- Security model: the game ships the public "anon" key. Row Level Security lets that key
-- INSERT rows and nothing else: it cannot read, change or delete anything. You read the data
-- with the service-role key (never put that in the game) or the Supabase dashboard.

create table if not exists public.events (
  id            bigint generated always as identity primary key,
  event_id      uuid        not null unique,
  player_id     uuid        not null,
  session_id    uuid        not null,
  event         text        not null check (event in
                  ('session_start', 'exposure', 'run_start', 'run_end', 'escape',
                   'session_end', 'client_error')),
  seq           integer     not null check (seq between 0 and 100000),
  client_ts     timestamptz not null,
  received_at   timestamptz not null default now(),
  experiment_id text        not null check (char_length(experiment_id) <= 64),
  variant       text        not null check (variant in ('standard', 'gentle_start')),
  game_version  text        not null check (char_length(game_version) <= 16),
  is_bot        boolean     not null default false,
  props         jsonb       not null default '{}'::jsonb check (pg_column_size(props) < 4000)
);

create index if not exists events_player_idx on public.events (player_id);
create index if not exists events_ts_idx on public.events (client_ts);

alter table public.events enable row level security;

-- the only thing the public key may do: add real-player rows
drop policy if exists "game inserts events" on public.events;
create policy "game inserts events" on public.events
  for insert to anon
  with check (is_bot = false);

-- no select / update / delete policies for anon -> those are denied
