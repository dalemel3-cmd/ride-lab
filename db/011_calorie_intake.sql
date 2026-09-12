-- Calorie intake, for a real TDEE rather than a formula-only estimate.
--
-- Dietary energy logged in a food-tracking app (MyFitnessPal, Cronometer, etc.)
-- and synced through Health Connect to Google Health. Lives on body_comp
-- alongside weight for the same reason resting_hr and hrv_ms do: one row per
-- day per source, so a day's intake and that morning's weight sit together
-- without a join.

alter table public.body_comp add column if not exists calories_in integer;

alter table public.body_comp drop constraint if exists body_comp_calories_in_check;
alter table public.body_comp add constraint body_comp_calories_in_check
  check (calories_in is null or (calories_in >= 0 and calories_in <= 15000));
