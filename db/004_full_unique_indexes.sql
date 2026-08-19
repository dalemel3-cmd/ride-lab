-- Make the import indexes usable by ON CONFLICT.
--
-- 002 created these as partial indexes (`where source is not null`). Postgres
-- will not match a partial unique index to an ON CONFLICT clause unless the
-- statement repeats the same WHERE predicate, and PostgREST has no way to
-- express that — so every upsert failed with "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification".
--
-- Plain unique indexes fix it without affecting hand-entered rows: those carry
-- source = null, and Postgres treats NULLs as distinct in a unique index, so
-- several manual entries per day remain allowed.

drop index if exists public.body_comp_source_day_idx;
create unique index body_comp_source_day_idx
  on public.body_comp (user_id, measured_at, source);

drop index if exists public.journal_source_day_idx;
create unique index journal_source_day_idx
  on public.journal_entries (user_id, entry_date, source);

drop index if exists public.rides_source_external_idx;
create unique index rides_source_external_idx
  on public.rides (user_id, source, external_id);
