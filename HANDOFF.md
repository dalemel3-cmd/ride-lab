# Ride Lab — handoff

Written for whoever (or whatever) picks this up next. Read `AGENTS.md` for house
style; this file is state, not conventions.

Last updated: 2026-08-30.

## What this is

A 16-week cycling case study, built as a mobile PWA for one rider (Dale,
Bentonville AR) under a Poseidon X Gen 3 ambassador deal. The output is a
document handed to a sponsor, so **the numbers have to survive someone checking
them**. That constraint drives most decisions here: figures are gated until
their window has filled, claims are gated on the sample behind them, and nothing
is invented to fill a gap.

Study window: 16 weeks. Benchmark ride is a 16-mile course first ridden
2026-08-23 (95.8 min moving, avg HR 134, 786 beats/mile).

## Stack

- React 19 + Vite 6, plain JS, `vite-plugin-pwa`, hash routing, no router lib
- Supabase: Postgres + RLS + Auth + Storage + Edge Functions (Deno)
- Vercel builds from `main`
- Project ref: `egyxalxfvsxucwtyzvat`

## Current state

**6 rides, 54.35 miles.** Five hand-logged or GPX-imported, one from Ride with
GPS. 53 `body_comp` rows syncing from Google Health. Baseline marked 2026-08-23.

**Deployed Edge Functions:**

| Function | Notes |
| --- | --- |
| `integrations` | sync/status/disconnect/probe/discover |
| `oauth-start` | |
| `oauth-callback` | **must stay `verify_jwt: false`** — providers redirect a bare browser here |
| `integrations-config` | reports which provider secrets exist, booleans only |
| `authcheck` | retired, safe to delete |

**Connected providers:** Google Health (resting HR, HRV, weight, body fat,
sleep), Ride with GPS (rides with per-point heart rate). Strava is configured in
code but not connected — its API returns only a summary polyline, no per-point
HR, so it adds little here.

## Immediate open items

1. **Redeploy `integrations`.** Two fixes are on `main` but may not be live:
   the duplicate guard (`5bb5484`) and the track-format fix (`eed41cb`).
   ```
   npx supabase functions deploy integrations --project-ref egyxalxfvsxucwtyzvat
   ```
   The upload list must include `_shared/ridewithgps.ts`.
2. **Rotate `RWGPS_CLIENT_SECRET`.** The current value was pasted into a chat
   transcript. Regenerate on Ride with GPS, update the Supabase secret. No code
   change.
3. **Benchmark ride** — repeat the 16-mile course from 2026-08-23 and compare
   against 786 beats/mile. Was waiting on a bike repair (left crank kept coming
   loose; rides on 27 and 29 August are flagged not-representative in their
   notes and should be excluded from any efficiency claim).
4. **Run the benchmark to protocol.** Written up in
   `docs/BENCHMARK-PROTOCOL.md`: hold 128-142 bpm on the 16-mile Greenway
   course, repeat every four weeks, record temperature and wind every time.
   Note the seasonal confound documented there — an August-to-December
   comparison in Arkansas is biased toward flattering the rider, and the
   mid-study repeats are the cleaner evidence.
5. **Same-route distance varies ~5%** — 8.79 mi vs 8.33 mi on identical ground.
   That difference alone moves a beats-per-mile comparison from "flat" to
   "-5.7%". Worth finding out whether one track is short.
6. **The readiness score steps rather than glides.** Its bands are hard
   thresholds, so a TSB of -14.9 and -15.1 score ten points apart. Smooth
   interpolation between band edges would make the number less twitchy.

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
- **The store returns rides newest-first.** `slice(-10)` gets the *oldest* ten.
- **ACWR compares 7 days against 28**, never against the 42-day CTL. Pass
  `acwrChronic`, not `ctl`. Getting this wrong reported an ACWR of 5.15 in
  week one.
- **Imports must not duplicate hand-logged rides.** The upsert key is
  `(user_id, source, external_id)`; hand-entered rides have `source = null` and
  will never collide. `syncRideWithGps` skips a trip when any ride starts within
  15 minutes of it.
- **Sync must never write `is_baseline: false`.** An upsert writes only the
  columns supplied; sending `false` erased the rider's chosen baseline on every
  sync and took every "vs baseline" comparison with it.
- **Beats-per-mile is confounded by intensity** and must not carry an adaptation
  claim on its own — the same rider scores 661 on a tempo ride and 700 on an
  easier one. `aerobicEfficiencyTrend` (speed at 120-135 bpm) is the controlled
  version; prefer it. Terrain still confounds both, so same-route comparison
  remains the strongest evidence available.
- **`excluded` on a ride means "not evidence about fitness", not "deleted".** It
  is filtered out of `efficiencyBySurface`, `routeProgress` and
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
npm test              # metrics, validation, track, recording, segments, ridewithgps
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

Roughly 545 checks total, all green at `eed41cb`.

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
npx supabase functions deploy <name> --project-ref egyxalxfvsxucwtyzvat
```

Secrets live in two places and behave differently — see `DEPLOY.md`.

## Where things are

```
src/data/metrics.js       all physiology, pure functions, heavily tested
src/data/track.js         the track tuple contract — read before touching a track
src/data/dates.js         timezone-anchored date helpers
src/data/store.js         offline-first queue
supabase/functions/       Edge Functions, _shared/ is bundled into each
db/                       migrations, applied in order
docs/RPE-PLAN.md          session-RPE background
docs/BENCHMARK-PROTOCOL.md the study's one controlled measurement
```
