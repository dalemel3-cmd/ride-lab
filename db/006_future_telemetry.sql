-- 006_future_telemetry.sql
-- Expand telemetry columns for cycling power, cadence, temperature, and advanced sleep stages.
-- These are nullable and bounded to prevent invalid telemetry values.

-- 1. Rides power, cadence, temperature, calories, TRIMP
alter table public.rides
  add column if not exists power_avg_watts integer check (power_avg_watts is null or (power_avg_watts between 0 and 2500)),
  add column if not exists power_max_watts integer check (power_max_watts is null or (power_max_watts between 0 and 3000)),
  add column if not exists cadence_avg_rpm integer check (cadence_avg_rpm is null or (cadence_avg_rpm between 20 and 220)),
  add column if not exists trimp_score numeric(6, 1) check (trimp_score is null or trimp_score >= 0),
  add column if not exists temperature_f numeric(4, 1) check (temperature_f is null or (temperature_f between -40 and 140)),
  add column if not exists calories integer check (calories is null or calories >= 0);

-- 2. Body composition & sleep architecture
alter table public.body_comp
  add column if not exists sleep_score integer check (sleep_score is null or (sleep_score between 0 and 100)),
  add column if not exists deep_sleep_min integer check (deep_sleep_min is null or deep_sleep_min >= 0),
  add column if not exists rem_sleep_min integer check (rem_sleep_min is null or rem_sleep_min >= 0),
  add column if not exists recovery_score integer check (recovery_score is null or (recovery_score between 0 and 100));

-- 3. Notify PostgREST to reload its schema cache
notify pgrst, 'reload schema';
