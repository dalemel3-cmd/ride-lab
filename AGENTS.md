# Working on Ride Lab

Context for anyone — human or AI — making changes here. Most of what follows was
learned by getting it wrong first, so treat the warnings as load-bearing rather
than stylistic.

## What this is

A personal PWA tracking a four-month cycling case study: rides with RPE and
heart rate, body composition against a fixed baseline, a journal, and a progress
view that pairs each chart with what it means physiologically. Single user.
React 19 + Vite + Supabase, deployed on Vercel.

The point is not the log — it is showing what happens to a body over sixteen
weeks, in a way someone else could copy. That is why every chart has a
plain-language note, and why fabricating a number is worse than missing one.

## Verify before you commit

```bash
npm run check        # lint + build + metric tests. Required before pushing.
```

Browser suites need a server. `tests/ui.js` and `tests/queue.js` want preview or
dev; `tests/gpx.js` needs **dev** specifically, because it imports a module by
source path that the built preview does not serve.

Pushing to `main` deploys to Vercel. Edge Functions do **not** deploy that way —
see below.

## Things that will bite you

**Dates.** Never slice an ISO string to get a calendar date. `ridden_at.slice(0, 10)`
reads the UTC date, so a 7pm Central ride files under tomorrow. Use `recordDate`
from `src/data/dates.js`. Google Health points carry a `civilTime.date` — prefer
it over `physicalTime` for the same reason.

**Missing means missing.** `Number(null)` and `Number('')` are both `0`, which is
finite. A naive `Number.isFinite` guard turns a blank field into a real zero and
poisons every average. Coerce absent values to `null` and let the metric return
`null` too. A ride with no heart rate is not a ride at 0 bpm.

**Partial unique indexes and `ON CONFLICT`.** Postgres will not match a partial
index to an upsert unless the statement repeats the index's `WHERE` clause, and
PostgREST cannot express that. Import indexes must be plain unique indexes. NULLs
are distinct, so hand-entered rows (`source = null`) still allow several per day.

**Edge Functions bundle their own copy of `_shared/providers.ts`.** Changing that
file means redeploying **all three** — `oauth-start`, `oauth-callback`, and
`integrations`. Deploying only some leaves the others on the old version, which
surfaces as an undefined config read that names nothing useful.

**Vite bakes `VITE_*` into the bundle at build time.** Changing an env var in
Vercel does nothing until a rebuild. And never put a `service_role` or
`sb_secret_` key in a `VITE_` variable — it ships to every visitor.

**Migrations run before deploys.** PostgREST rejects inserts naming unknown
columns, so code that ships ahead of its migration fails every write. Add a new
numbered file in `db/`; never edit an applied one.

## Conventions

- **No hardcoded tunables.** Thresholds, zones, study length, max HR — all in
  `src/settings.js` with bounds in `NUMERIC_BOUNDS`.
- **Metrics are pure.** Everything in `src/data/metrics.js` is a pure function of
  its arguments, so the physiology can be checked against hand-worked values.
- **Offline-first.** Writes go to localStorage before Supabase and queue on
  failure. A ride lost to a dead zone on a trail is unrecoverable. Never add a
  fallback that strips unknown columns to force a write through — that turns a
  schema mismatch into silent data loss.
- **Nothing is discarded automatically.** A queue entry that cannot sync is
  surfaced with the server's own error and discarded only on request.
- **Touch targets ≥ 44px.** Used with gloves, one-handed, out of breath. The UI
  suite asserts it.
- **Styling is CSS custom properties + inline style objects.** Tokens live in
  `src/styles.css`; there is no CSS framework.

## Rules about the data itself

These are product decisions, not preferences. Please don't "improve" them.

- **Never infer RPE.** No API knows how hard a ride felt, and deriving it from
  heart rate fabricates the study's most important subjective field. Imported
  rides show an "Add RPE" prompt instead.
- **Never auto-set the baseline.** Which day starts the study is a decision the
  rider makes. Imported rows always set `is_baseline: false`.
- **Hand-entered values beat synced ones.** Imports use `ignoreDuplicates` where
  overwriting could destroy something typed.
- **Compare like with like.** Beats-per-mile is grouped by surface, because
  singletrack costs far more per mile than pavement at identical fitness.
  Comparing across surfaces measures the trail, not the rider.

## Integrations

`docs/INTEGRATIONS.md` has setup. Current state:

- **GPX import** — the primary path. Free, no API key, no subscription. Works
  with exports from Strava, Garmin, Wahoo, and any head unit.
- **Google Health** — body composition and sleep. Replaces Fitbit.
- **Strava API** — implemented but unused: it requires a paid subscription as of
  June 2026, and GPX covers the same ground.
- **Fitbit** — retired. The Web API is switched off at the end of September 2026.
  Kept in the schema so existing rows stay valid; not offered in the UI.

When mapping a new provider field, **verify the response shape against a live
account first**. The `probe` and `discover` actions on the `integrations`
function exist for this. Google documents neither units nor most data type
identifiers: weight arrives as `weightGrams`, and `resting-heart-rate` is not a
data type at all. Both were assumptions that a probe disproved in seconds.

## Layout

```
src/
  data/        store.js (offline queue), metrics.js (pure), dates.js, gpx.js
  features/    rides, body, journal, routes, progress, settings
  settings.js  every tunable value, with bounds
db/            SQL migrations, applied in order
supabase/functions/   Edge Functions — deployed separately from the front end
tests/         metrics (node), ui/queue/gpx (playwright)
```
