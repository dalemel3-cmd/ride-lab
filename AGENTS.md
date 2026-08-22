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

`no-undef` is enabled, so an identifier that is used but never defined now fails
the lint step. It was not enabled once, and a deleted `avgHr` calculation with
its reference left behind passed lint while throwing on every GPX import. Lint
still cannot tell you a value is wrong — only that it exists — so the browser
suites remain necessary.

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

**Track points come in two widths.** A point is
`[lat, lon, epochMs, elevationM, heartRate]`, but it used to be just the first
three, and rides recorded before the widening still sit in the same `jsonb`
column — which is why that change needed no migration. `point[3]` on an older
ride is `undefined`, and `undefined` becomes `NaN` the moment it reaches
arithmetic. Always read through the accessors in `src/data/track.js`; never
index a track directly. Elevation is stored in **metres** (GPX's native unit)
and converted to feet only for display.

**Never put a side effect in a state updater.** React invokes updater functions
twice under StrictMode to surface impure ones. Auto-pause adjusted the clock
inside `setTrack`'s updater, so every transition banked the elapsed time twice
and moving time ran fast. Side effects belong in an effect, guarded by a ref so
they stay idempotent — StrictMode runs effects twice too.

**GPS drift zigzags; judge movement by displacement.** A stationary phone
produces fixes that wander several metres each way. Summed as *path length*
that reads as a brisk 13 mph with the bike against a tree, so both
`shouldAutoPause` and `movingDistanceMiles` measure straight-line displacement
across a window instead. Tight switchbacks make that read slightly low for a
moving rider, which is the right direction to be wrong.

**A backgrounded tab loses its geolocation watch.** Browsers throttle or suspend
it and do not reliably resume, so the visibility handler re-arms the watch as
well as the wake lock. Without that, checking a map or letting the screen lock
silently ended the track while the UI went on claiming to record.

**Recording has two clocks and two pauses.** `elapsedFrom()` reports *moving*
time: `startedAtRef` is null whenever the clock is frozen, so stopped time never
accumulates. A manual pause stops the GPS watch; an auto-pause must not, because
it has to keep watching to notice the rider moving again. Auto-pause is
windowed, so it lags a few seconds at each transition — it undercounts moving
time slightly rather than counting stops as riding, which is the right direction
to err.

**Web Bluetooth is Android and desktop only.** Safari on iOS has no
`navigator.bluetooth`, so heart-rate straps cannot work there. `isSupported()`
gates the UI and the fallback text says why — don't "fix" it by hiding the
message. The measurement packet (GATT 0x2A37) has a flags byte whose bit 0
selects uint8 vs little-endian uint16; reading the wrong width returns plausible
nonsense rather than throwing, which is why `parseHeartRateMeasurement` is pure
and tested rather than inlined in the listener.

**A neutral starting value is not a result.** `dailyReadiness` begins at 75 as an
anchor for real signals to move. It counts how many actually contributed and
returns `null` when that is zero — otherwise an empty account scored a fixed 77
and told the rider they were at "Optimal Readiness" forever. Any composite score
added later needs the same guard, and callers must pass `null` rather than `0`
for an input they do not have. Default parameter values are where this hides.

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
  Comparing across surfaces measures the trail, not the rider. GPS segments
  (`src/data/segments.js`) are the strongest version of this: same ground, so
  terrain is eliminated rather than merely grouped.
- **Segment heart rate is measured, then labelled.** Tracks with per-point heart
  rate give the segment its own average. Older tracks fall back to the ride-wide
  average, and both the table and the trend line say which is which
  (`hrChangeSource`). Never blend the two or drop the label — a whole-ride
  average compared across two different-length rides is a much weaker claim.
- **VAM only on real climbs.** Shown above 3% average gradient. On rolling
  ground it measures the terrain and the wind, not the rider.

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
account first** — Settings has a "What syncs?" button that returns raw samples,
and `probe`/`discover` back it. Google documents neither units nor identifiers,
and on this API the plausible name and the real one are usually different:

| what you would guess | what it actually is |
| --- | --- |
| `kilograms` | `weightGrams` |
| `resting-heart-rate` | not a data type at all |
| `daily-heart-rate-variability` | `heart-rate-variability` |
| `rmssd` / `hrvMilliseconds` | `rootMeanSquareOfSuccessiveDifferencesMilliseconds` |

A wrong identifier or field fails **silently as "no data"**, never as an error,
so every one of these cost days before anyone noticed. Two further undocumented
behaviours: results come back **newest-first**, and an upper time bound joined
with `AND` is not supported. Neither is relied on — the heart-rate pager sends
only a lower bound, trims in code, and stops when a page adds nothing in range,
which is correct whichever way the API sorts.

A 403 on a data type means the **scope was never granted**, not that the data is
missing. `vo2-max`, `steps`, and `active-minutes` all sit behind scopes this app
does not request.

## Layout

```
src/
  data/        store.js (offline queue), metrics.js (pure), dates.js, gpx.js,
               segments.js (GPS matching), track.js (point accessors),
               recording.js (auto-pause, live pace, BLE parsing),
               heartRateSensor.js (Web Bluetooth)
  features/    rides, body, journal, routes, progress, settings
  settings.js  every tunable value, with bounds
db/            SQL migrations, applied in order
supabase/functions/   Edge Functions — deployed separately from the front end
tests/         metrics + track + recording + segments (node),
               ui/queue/gpx (playwright)
```
