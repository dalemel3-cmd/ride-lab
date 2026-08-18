-- Strava and Fitbit integration support.
--
-- Security posture: OAuth tokens are never readable by the browser. Both tables
-- below have RLS enabled and *no policies at all*, which denies every request
-- made with the anon or authenticated key. Only the Edge Functions, which use
-- the service-role key, can touch them. The client learns whether a provider is
-- connected by calling a function, never by reading the row.

-- ---------------------------------------------------------------------------
-- integrations — one row per user per provider
-- ---------------------------------------------------------------------------
create table if not exists public.integrations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  provider       text not null check (provider in ('strava', 'fitbit')),
  access_token   text not null,
  refresh_token  text,
  -- Both providers issue short-lived access tokens (Strava 6h, Fitbit 8h), so
  -- every call has to be prepared to refresh first.
  expires_at     timestamptz,
  scope          text,
  athlete_id     text,
  connected_at   timestamptz not null default now(),
  last_synced_at timestamptz,
  unique (user_id, provider)
);

alter table public.integrations enable row level security;
-- Intentionally no policies: service-role only.

-- ---------------------------------------------------------------------------
-- oauth_states — short-lived CSRF nonces
-- ---------------------------------------------------------------------------
-- The `state` parameter has to survive a round trip through the provider and
-- come back proving which user started the flow. Storing it server-side means
-- the browser never carries anything forgeable.
create table if not exists public.oauth_states (
  state      text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  provider   text not null check (provider in ('strava', 'fitbit')),
  redirect_to text,
  created_at timestamptz not null default now(),
  -- Ten minutes is plenty to click through a consent screen.
  expires_at timestamptz not null default now() + interval '10 minutes'
);

alter table public.oauth_states enable row level security;
-- Intentionally no policies: service-role only.

create index if not exists oauth_states_expires_idx on public.oauth_states (expires_at);

-- ---------------------------------------------------------------------------
-- Imported-record provenance
-- ---------------------------------------------------------------------------
-- `external_id` is what makes importing idempotent: re-running a sync updates
-- the ride it already created instead of adding a duplicate every time.
alter table public.rides add column if not exists source text;
alter table public.rides add column if not exists external_id text;

create unique index if not exists rides_source_external_idx
  on public.rides (user_id, source, external_id)
  where source is not null and external_id is not null;

alter table public.body_comp add column if not exists source text;

-- One body-composition row per day per source, so a repeated Fitbit sync
-- updates the day's numbers rather than stacking duplicates.
create unique index if not exists body_comp_source_day_idx
  on public.body_comp (user_id, measured_at, source)
  where source is not null;

alter table public.journal_entries add column if not exists source text;

create unique index if not exists journal_source_day_idx
  on public.journal_entries (user_id, entry_date, source)
  where source is not null;
