-- 009_ridewithgps.sql
-- Allow 'ridewithgps' as an integration provider.
--
-- Why this provider is worth adding alongside Strava: Strava's activity list
-- returns a summary polyline, which is [lat, lng] pairs and nothing else. Ride
-- with GPS returns full trip track points carrying per-point heart rate (`h`),
-- elapsed time (`t`) and elevation (`e`). Everything in this study that needs
-- continuous heart rate — time in zones, the polarized 80/20 audit, the
-- 5-zone breakdown — currently only works for rides imported from a GPX file
-- by hand. This makes it work on sync.
--
-- The provider name is stored as text with a CHECK rather than an enum, so
-- widening it is an ALTER on the constraint rather than a type migration.

alter table public.integrations
  drop constraint if exists integrations_provider_check;

alter table public.integrations
  add constraint integrations_provider_check
  check (provider = any (array['strava', 'fitbit', 'google_health', 'ridewithgps']));

alter table public.oauth_states
  drop constraint if exists oauth_states_provider_check;

alter table public.oauth_states
  add constraint oauth_states_provider_check
  check (provider = any (array['strava', 'fitbit', 'google_health', 'ridewithgps']));

notify pgrst, 'reload schema';
