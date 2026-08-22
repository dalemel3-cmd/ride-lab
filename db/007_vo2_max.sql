-- Measured VO2 max, in ml/kg/min, as reported by the device.
--
-- Kept separate from the Uth-Sorensen estimate the app derives from resting
-- heart rate. The estimate is a formula applied to one number; this is what the
-- watch actually measured. Storing them in one column would make a change in
-- method look like a change in fitness, which is the sort of artefact a
-- four-month study cannot afford.
--
-- Reaching this data needs an OAuth scope the app did not originally request:
-- googlehealth.activity_and_fitness.readonly. Without it Google answers 403 on
-- the vo2-max data type, which reads like missing data but is not.
alter table public.body_comp
  add column if not exists vo2_max numeric;

comment on column public.body_comp.vo2_max is
  'Device-measured VO2 max in ml/kg/min. Null when unmeasured; the app falls back to its own estimate and labels which it is showing.';
