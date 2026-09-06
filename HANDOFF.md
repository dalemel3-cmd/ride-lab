# Ride Lab — handoff for Antigravity

Written for whoever (or whatever) picks this up next. Read `AGENTS.md` for house
style; this file is state, not conventions.

Last updated: 2026-09-07.

## What this is

A 16-week cycling case study, built as a mobile PWA for one rider (Dale,
Bentonville AR) under a Poseidon X Gen 3 ambassador deal. The output is a
document handed to a sponsor, so **the numbers have to survive someone checking
them**. That constraint drives most decisions here: figures are gated until
their window has filled, claims are gated on the sample behind them, and
nothing is invented to fill a gap. Several past bugs were exactly this pattern
in reverse — a number presented more confidently than the data supported — see
Gotchas below before you add a new metric.

Study window: 16 weeks, started 2026-08-23 (day of the baseline measurement).
Today is day 16, week 3. Benchmark ride is a 16-mile course first ridden
2026-08-23 (95.8 min moving, avg HR 134, 786 beats/mile).

## Stack

- React 19 + Vite 6, plain JS, `vite-plugin-pwa`, hash routing, no router lib
- Supabase: Postgres + RLS + Auth + Storage + Edge Functions (Deno)
- Vercel builds from `main`
- Project ref: `egyxalxfvsxucwtyzvat`

## Current state

**13 rides, 135.4 miles, 3,191 ft climbing, 12.7 hours.** Surface mix: 43% road,
30% paved trail, 27% gravel — no singletrack yet, though Slaughter Pen and
Coler are in the route library if the study goes there. 53+ `body_comp` rows
syncing from Google Health. Baseline marked 2026-08-23.

Two rides are excluded from every fitness figure: a left crank arm worked loose
on 2026-08-27 and again on 2026-08-29, cutting the second ride short at
5.75 mi. Both are flagged `excluded` with a reason in the notes. A shop fixed
it before the next ride (2026-08-30, note: "bike felt great"); 81+ miles since
with no recurrence, including a 30-mile ride.

**The 2026-09-06 ride is the study's biggest event so far**: 30.3 mi, 965 ft,
2h48, RPE 8, peak HR 183. That peak matters — across roughly 21,000 prior
heart-rate samples nothing had exceeded 170, so every zone in the app rested on
an untested `maxHr = 190`. 183 bpm at a real effort makes that number
defensible rather than assumed. Session load was 1,344 — exactly 2× the
previous largest single session (671, the 16-mile benchmark) — so the days
immediately after are deliberately easy in the training plan; don't read a
flat week as stagnation.

HRV and resting HR are both trending in the right direction: resting HR
57→54 bpm over two weeks, HRV +6.6% against the pre-training reference. Body
composition and cross-week beats-per-mile are explicitly **not** claimed yet —
see Gotchas.

**Deployed Edge Functions:**

| Function | Notes |
| --- | --- |
| `integrations` | sync/status/disconnect/probe/discover, currently v29+, includes `_shared/health.ts` and `_shared/ridewithgps.ts` |
| `oauth-start` | |
| `oauth-callback` | **must stay `verify_jwt: false`** — providers redirect a bare browser here |
| `integrations-config` | reports which provider secrets exist, booleans only |

`authcheck` was retired and deleted — if you see it referenced anywhere that's
stale.

**Connected providers:** Google Health (resting HR, HRV, weight, body fat,
sleep), Ride with GPS (rides with per-point heart rate, `source =
'ridewithgps'`). Strava is configured in code but not connected — its API
returns only a summary polyline, no per-point HR, so it adds little here. Two
recording sources exist in the data and they disagree about distance on
identical ground by ~4.3% — see Gotchas, this is load-bearing for anything
that compares rides across time.

## The one thing most likely to trip you up: zoneModel is built but not wired

`src/data/metrics.js` has `zoneModel()`, `lthrZoneRanges()`, `estimateLthr()`,
and `bestEffortCurve()` — a full threshold-anchored zone system, tested
(`tests/metrics.js`, the "Threshold estimate and zone model" and "Best-effort
curve" sections). `src/settings.js` has a nullable `lthr` field and
`Settings → Threshold HR` lets the rider enter a tested value.
`docs/THRESHOLD-TEST.md` is the field-test protocol.

**None of the screens call it.** Every zone-dependent call site still uses the
old percentage-of-max path directly:

```
grep -rn "hrZoneRanges(settings\|timeInZones(.*settings.maxHr\|hrZone(.*maxHr" src/features/
```

finds five sites across `DashboardScreen.jsx`, `ProgressScreen.jsx`,
`RideLogScreen.jsx`, `RecordRide.jsx`. Right now, entering a threshold in
Settings does nothing visible anywhere in the app. This is the highest-value
next task: swap each of those call sites to derive its zone ranges from
`zoneModel({ rides, settings })` instead of `hrZoneRanges(settings.maxHr)`
directly, and thread `zoneModel().provisional` through to a `Confidence` badge
(see below) so a screen showing max-anchored zones says so.

## Confidence component — built, mostly wired, worth auditing

The UI-brief work (`docs/UI-BRIEF.md`) landed: `Confidence` in
`src/components/ui.jsx`, used in 41 places across the feature screens,
`buildStudyReport.js` extracted from `ProgressScreen.jsx` as a pure function.
Worth a pass to confirm every *new* provisional claim (the zone model included,
once wired per above) gets a badge — the brief's rule was that a `measured`
value renders nothing and only `provisional`/`inconclusive` draw a badge, so an
omission here is invisible unless you go looking.

## Immediate open items, roughly in priority order

1. **Wire `zoneModel` into the five call sites above.** This is the reason the
   whole threshold-test feature currently does nothing.
2. **A 20-minute threshold test is due**, per `docs/THRESHOLD-TEST.md` — not a
   code task, but if the rider logs one, confirm `estimateLthr`'s `confidence`
   moves from `'floor'` and the derived zones update once (1) is done.
3. **Rotate `RWGPS_CLIENT_SECRET`.** The current value was pasted into a chat
   transcript. Regenerate on Ride with GPS, update the Supabase secret. No code
   change.
4. **Run the benchmark to protocol.** Written up in `docs/BENCHMARK-PROTOCOL.md`:
   hold 128-142 bpm on the 16-mile Greenway course, repeat every four weeks,
   record temperature and wind every time. Note the seasonal confound
   documented there — an August-to-December comparison in Arkansas is biased
   toward flattering the rider, and the mid-study repeats are the cleaner
   evidence.
5. **Ride the benchmark on one device.** The same-route variance is diagnosed
   (see gotchas): it is the phone reading ~4.3% long against Ride with GPS,
   not a short track. `routeProgress` now flags mixed-device comparisons, but
   the real fix is behavioural — record every benchmark the same way.
6. **The readiness score steps rather than glides.** Its bands are hard
   thresholds, so a TSB of -14.9 and -15.1 score ten points apart. Smooth
   interpolation between band edges would make the number less twitchy.
7. **Settings → Case study → Start date**: should read `2026-08-23` or be
   blank (derives it automatically via `resolveStudyStart`). If a stale value
   is set it silently overrides the correct derivation.
8. **A possible 25-mile race on 2026-10-17** is under discussion with the
   rider — 40 days out, and 5 mi under the current longest ride, so not a
   stretch goal. If a training plan gets built for it, it belongs in `docs/`
   alongside the benchmark and threshold protocols, not just in chat.

## Gotchas that have already caused real bugs

These are not hypothetical — each one shipped and had to be found in the data.

- **Track tuple format is `[lat, lon, epochMs, elevationM, heartRate]`**, and
  `src/data/track.js` is the only place that should index it. Elevation is
  **metres**; feet are display-only. A timestamp of `0` means *absent*, not the
  epoch. The Ride with GPS importer originally wrote seconds-from-start and
  feet — nothing errored, a 43-minute ride just scored as 2.6 seconds.
- **Dates are America/Chicago, via `src/data/dates.js`.** Never
  `toISOString().slice(0,10)` — that reads the UTC date. Foster monotony did
  this and gave different answers morning vs evening on the same day.
- **HRV is many samples a night, not one value a day.** Health Connect writes
  an rMSSD reading every few minutes through sleep. The Google sync originally
  assigned each sample to its date the way it does weight and resting HR —
  last write wins — which stored one arbitrary moment as the night. The series
  read 37, 81, 110, 56, 116 on consecutive nights; the rider's own Fitbit app
  showed 98 for the night this recorded as 116. `_shared/health.ts` now takes
  the mean. Anything sampled continuously needs the same treatment.
- **HRV must not be compared against the `is_baseline` row.** That row is
  right for weight and waist, which one ride does not move. rMSSD drops
  sharply the night after a hard effort, and this study's baseline day *was*
  the 16-mile RPE-7 benchmark: 63 ms against 87 and 93 the two nights before,
  resting HR up three beats. Measured against it the case study claimed a 63%
  HRV gain; the honest figure against the pre-training nights is ~15%, and the
  real finding is a flat mean with day-to-day variability halving. Use
  `preTrainingHrv`.
- **Two recording sources measure the same road differently.** Rides carrying
  `source = 'ridewithgps'` log ~65 points/min; hand-logged and GPX rides log
  10-24. On the Grand Blvd → Razorback Greenway course — same start, turnaround
  agreeing to 0.01 mi, bounding box to 0.07 mi — the phone measured 8.68 track
  miles and Ride with GPS 8.32, a 4.3% gap. It is *not* the sample interval:
  decimating the dense track to the sparse rate costs only 0.8%. It is
  per-point GPS noise, and it inflates in one direction. Speed and
  beats-per-mile are both distance-sensitive, so a cross-device change under
  4.3% is the devices disagreeing. See `CROSS_SOURCE_DISTANCE_BIAS_PCT` and
  `routeProgress`.
- **The store returns rides newest-first.** `slice(-10)` gets the *oldest* ten.
- **`caseStudyStartDate` defaulting to "today"** dated the whole study to the
  day someone opened the app, not the day training started — inflated every
  week number and put the study's start after its own baseline measurement.
  Fixed by `resolveStudyStart()`, which prefers the baseline row, falls back to
  the earliest analysable ride, and only uses today if neither exists.
- **Clearing a numeric Settings field used to set it to the field's minimum,
  not the default.** `Number('')` is `0`, which is finite, so it passed the
  `Number.isFinite` guard and got clamped upward to `NUMERIC_BOUNDS[key].min`.
  Clearing Max HR silently set it to 120 — which puts nearly every ride in
  zone 5. Fixed in `settings.js`'s `clamp()`; check this pattern before adding
  any new numeric setting. `NULLABLE_NUMERIC` marks the settings where "not
  set" is itself a real state (currently just `lthr`).
- **Excluded rides must not consume expensive backfill budgets.** The Google
  Health heart-rate backfill scans forward from a ride's date with no way to
  page directly to it; an excluded ride (the aborted mechanical) once burned
  the entire 6,000-sample scan budget and then reported "no heart rate found,"
  which reads as a missing strap rather than as "never got there." Excluded
  rides are now skipped, and the two failure modes (ran out of data vs. ran
  out of budget) are reported differently.
- **ACWR compares 7 days against 28**, never against the 42-day CTL. Pass
  `acwrChronic`, not `ctl`. Getting this wrong reported an ACWR of 5.15 in
  week one.
- **Imports must not duplicate hand-logged rides.** The upsert key is
  `(user_id, source, external_id)`; hand-entered rides have `source = null` and
  will never collide. `syncRideWithGps` skips a trip when any ride starts
  within 15 minutes of it.
- **Sync must never write `is_baseline: false`.** An upsert writes only the
  columns supplied; sending `false` erased the rider's chosen baseline on every
  sync and took every "vs baseline" comparison with it.
- **Beats-per-mile is confounded by intensity** and must not carry an
  adaptation claim on its own — the same rider scores 661 on a tempo ride and
  700 on an easier one. `aerobicEfficiencyTrend` (speed at 120-135 bpm) is the
  controlled version; prefer it. Terrain still confounds both, so same-route
  comparison remains the strongest evidence available.
- **`excluded` on a ride means "not evidence about fitness", not "deleted".**
  It is filtered out of `efficiencyBySurface`, `routeProgress` and
  `aerobicEfficiencyTrend` via `analysable()`, and deliberately still counts
  toward volume and training load.
- **Never put a service-role or `sb_secret_` key in a `VITE_` variable** — it
  ships to every visitor. `.env` is gitignored and stays that way.
- `integrations` and `oauth_states` have RLS enabled with **no policies**. That
  is deliberate: service-role only.

## Tests

```
npm run lint          # oxlint
npm run build
npm test              # metrics, validation, track, recording, segments, ridewithgps, health
```

Browser suites need a server and Playwright:

```
npm run build && npm run preview       # then:
node tests/ui.js                       # expects http://127.0.0.1:4173
npm run dev                            # then (these import /src):
APP_URL=http://127.0.0.1:5173 node tests/gpx.js
APP_URL=http://127.0.0.1:5173 node tests/queue.js
APP_URL=http://127.0.0.1:5173 node tests/photos.js
```

Roughly 610+ checks total (`npm test` prints per-file totals; 279 in the main
run alone), all green as of `3300438`. `tests/ui.js` honours a `CHROMIUM_PATH`
env var if the bundled Playwright browser isn't at the default location.

`node scripts/validate_palette.js` if you touch chart colors — the app's own
zone-color ramp fails the CVD normal-vision floor at Z4/Z5, so don't reuse it
for anything new.

Edge Functions are Deno and `jsr.io` may be unreachable in a sandbox. To
typecheck, stub the client:

```jsonc
// deno.json
{ "imports": { "jsr:@supabase/supabase-js@2": "./supabase-shim.ts" } }
```

## Deploying

Vercel builds the frontend from `main` automatically. Edge Functions do **not**
auto-deploy — they need the CLI, run from the repo root:

```
npx supabase functions deploy <name>
```

Confirm the upload list includes every file under `supabase/functions/_shared/`
— a partial upload (missing `_shared/health.ts` or `_shared/ridewithgps.ts`)
deploys silently broken code with no error. Secrets live in two places and
behave differently — see `DEPLOY.md`.

## Where things are

```
src/data/metrics.js        all physiology, pure functions, heavily tested
src/data/track.js          the track tuple contract — read before touching a track
src/data/dates.js          timezone-anchored date helpers
src/data/store.js          offline-first queue
src/settings.js            every tunable value, NUMERIC_BOUNDS, NULLABLE_NUMERIC
src/components/ui.jsx      shared UI atoms, including Confidence
src/features/*/            one folder per screen; ProgressScreen.jsx is the
                            case-study view, largest file; its markdown export
                            lives in the sibling buildStudyReport.js
supabase/functions/        Edge Functions, _shared/ is bundled into each
db/                        migrations, applied in order
docs/RPE-PLAN.md           session-RPE background
docs/BENCHMARK-PROTOCOL.md the study's one controlled measurement
docs/THRESHOLD-TEST.md     the 20-minute field test that anchors the zones
docs/UI-BRIEF.md           the confidence-badging brief (implemented)
```
