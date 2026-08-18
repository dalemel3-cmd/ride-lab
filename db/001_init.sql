-- Ride Lab initial schema
--
-- Apply this BEFORE deploying the app. PostgREST rejects inserts that name
-- unknown columns, so a deploy that runs ahead of its migration fails every
-- write instead of degrading gracefully.
--
-- Every table is scoped to a single user via `user_id`, with RLS on and one
-- policy covering all four verbs. This is a personal log: there is no shared
-- data and no reason for any row to be readable by anyone else.

-- ---------------------------------------------------------------------------
-- rides
-- ---------------------------------------------------------------------------
create table if not exists public.rides (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  ridden_at    timestamptz not null default now(),
  route_name   text,
  distance_mi  numeric(6, 2) check (distance_mi is null or distance_mi >= 0),
  duration_min numeric(6, 1) check (duration_min is null or duration_min >= 0),
  elevation_ft integer check (elevation_ft is null or elevation_ft >= 0),
  avg_hr       integer check (avg_hr is null or (avg_hr between 30 and 240)),
  max_hr       integer check (max_hr is null or (max_hr between 30 and 240)),
  rpe          integer check (rpe is null or (rpe between 1 and 10)),
  surface      text check (surface is null or surface in ('road', 'gravel', 'singletrack', 'paved-trail')),
  notes        text,
  -- GPS track as [[lat, lng, epoch_ms], ...]. Null for manually entered rides.
  track        jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists rides_user_ridden_at_idx on public.rides (user_id, ridden_at desc);

-- ---------------------------------------------------------------------------
-- body_comp
-- ---------------------------------------------------------------------------
create table if not exists public.body_comp (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  measured_at   date not null default current_date,
  weight_lbs    numeric(5, 1) check (weight_lbs is null or (weight_lbs between 50 and 600)),
  body_fat_pct  numeric(4, 1) check (body_fat_pct is null or (body_fat_pct between 1 and 70)),
  waist_in      numeric(4, 1) check (waist_in is null or (waist_in between 10 and 100)),
  hip_in        numeric(4, 1) check (hip_in is null or (hip_in between 10 and 100)),
  resting_hr    integer check (resting_hr is null or (resting_hr between 25 and 150)),
  -- Marks the start-of-study measurement that every later one is compared to.
  is_baseline   boolean not null default false,
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists body_comp_user_measured_at_idx on public.body_comp (user_id, measured_at desc);

-- ---------------------------------------------------------------------------
-- journal_entries
-- ---------------------------------------------------------------------------
create table if not exists public.journal_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  entry_date date not null default current_date,
  -- Optional: ties a journal entry to the ride that prompted it.
  ride_id    uuid references public.rides (id) on delete set null,
  mood       integer check (mood is null or (mood between 1 and 5)),
  energy     integer check (energy is null or (energy between 1 and 5)),
  soreness   integer check (soreness is null or (soreness between 1 and 5)),
  sleep_hrs  numeric(3, 1) check (sleep_hrs is null or (sleep_hrs between 0 and 24)),
  body       text,
  created_at timestamptz not null default now()
);

create index if not exists journal_user_entry_date_idx on public.journal_entries (user_id, entry_date desc);

-- ---------------------------------------------------------------------------
-- routes — the Bentonville library, so logging a ride is a pick, not typing
-- ---------------------------------------------------------------------------
create table if not exists public.routes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name         text not null,
  area         text,
  distance_mi  numeric(6, 2) check (distance_mi is null or distance_mi >= 0),
  elevation_ft integer check (elevation_ft is null or elevation_ft >= 0),
  surface      text check (surface is null or surface in ('road', 'gravel', 'singletrack', 'paved-trail')),
  difficulty   text check (difficulty is null or difficulty in ('green', 'blue', 'black', 'double-black')),
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists routes_user_name_idx on public.routes (user_id, name);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.rides           enable row level security;
alter table public.body_comp       enable row level security;
alter table public.journal_entries enable row level security;
alter table public.routes          enable row level security;

-- `to authenticated` keeps the anon role out entirely, and repeating the
-- predicate in `with check` stops a row being written under someone else's id.
create policy rides_owner on public.rides
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy body_comp_owner on public.body_comp
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy journal_entries_owner on public.journal_entries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy routes_owner on public.routes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
