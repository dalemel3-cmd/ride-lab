-- Google Health API as a third provider.
--
-- Replaces Fitbit for body data. The Fitbit Web API is decommissioned at the
-- end of September 2026 and its tokens do not carry over, so Fitbit is kept in
-- the allowed list only so existing rows remain valid — new connections should
-- use google_health.

alter table public.integrations drop constraint if exists integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check
  check (provider in ('strava', 'fitbit', 'google_health'));

alter table public.oauth_states drop constraint if exists oauth_states_provider_check;
alter table public.oauth_states add constraint oauth_states_provider_check
  check (provider in ('strava', 'fitbit', 'google_health'));
