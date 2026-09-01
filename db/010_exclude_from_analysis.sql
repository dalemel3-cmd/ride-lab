-- 010_exclude_from_analysis.sql
-- Let a ride be kept in the log but held out of adaptation analysis.
--
-- Two rides in this study were ridden with a crank arm working loose, and one
-- of them is currently the first point in the road efficiency trend — so every
-- "since baseline" figure is measured from a mechanical failure. Deleting them
-- would be worse: the rides happened, the time was spent, and a log with gaps
-- in it is not a record of anything.
--
-- Scope is deliberately narrow. An excluded ride still counts toward volume,
-- duration and training load, because the body did that work and carried the
-- fatigue. What it stops contributing to is any claim about *fitness*:
-- beats-per-mile, speed at a fixed heart rate, and repeated-course comparison.

alter table public.rides
  add column if not exists excluded boolean not null default false,
  add column if not exists excluded_reason text;

comment on column public.rides.excluded is
  'Hold this ride out of efficiency and adaptation analysis. Still counted in volume and training load.';

notify pgrst, 'reload schema';
