# Ride Lab

A mobile PWA for tracking a four-month cycling case study: rides, RPE, heart rate, body
composition, and a journal — built to be simple enough to keep up with every day, and detailed
enough to show what cycling actually does to a body over sixteen weeks.

Built around a Poseidon X Gen 3 in Bentonville, Arkansas.

---

## What it tracks

**Rides.** Distance, duration, elevation, average and max heart rate, RPE, surface, route and
notes. Enter them by hand from a head unit, or record with GPS in the app — the route draws as a
map, and the measured distance and time pre-fill the form so only heart rate and RPE need typing.

**Body composition.** Weight, body fat, waist, hip, and resting heart rate, all measured against a
fixed baseline. Trend charts plus a Baseline vs. Now comparison, and an estimated VO2 max derived
from resting heart rate.

**Journal.** Mood, energy, soreness, sleep, and free text, optionally tied to the ride that
prompted it. This is what explains the other numbers months later.

**Progress.** The case-study view — weekly volume, training load, heart-rate zones, and the
headline chart: heartbeats spent per mile, which falls as aerobic fitness improves. Every chart
is paired with a plain-language note on what it means physiologically.

## The metrics, and where they come from

| Metric | Formula | Source |
| --- | --- | --- |
| Training load | RPE × minutes | Foster, session RPE (1998) |
| Predicted max HR | 208 − 0.7 × age | Tanaka et al. (2001) |
| Estimated VO2 max | 15.3 × (max HR / resting HR) | Uth–Sørensen (2004) |
| Heartbeats per mile | (avg HR × minutes) / miles | Aerobic efficiency proxy |
| Efficiency factor | mph / avg HR | Rises as fitness improves |

Heart-rate zones use the standard five-zone model as percentages of max HR. A measured max always
beats a predicted one — set yours in Settings.

## Running it

```bash
npm install
cp .env.example .env        # fill in your Supabase URL and anon key
npm run dev
```

Then `npm run build && npm run preview` to check the production build, and open it on your phone —
**Add to Home Screen** installs it as a standalone app.

### Database

Apply `db/001_init.sql` to a Supabase project **before** first run. PostgREST rejects inserts that
reference unknown columns, so the schema has to exist first. Four tables — `rides`, `body_comp`,
`journal_entries`, `routes` — each row-level-secured to its owner.

## Offline

The app is built for trails with no signal. Every write goes to `localStorage` first and Supabase
second; if the network write fails the record is queued and retried on reconnect, on app start,
and whenever the app returns to the foreground. Saves report success because the data genuinely
is safe on the device.

Rows created offline get a real UUID up front, so a retried write converges on the same row rather
than creating a duplicate ride. There is deliberately no "strip unknown columns and force the
insert through" fallback — that turns a schema mismatch into silent data loss.

Settings → **Export JSON** dumps every ride, measurement, and journal entry, including anything
still queued. Worth doing at the end of the study, and any time someone wants the raw numbers
behind the charts.

## Testing

```bash
node tests/metrics.js       # 74 checks: the physiology math, against hand-worked values

npm run build && npm run preview
npm install --no-save playwright && npx playwright install chromium
node tests/ui.js            # 32 checks: full app, Supabase stubbed, iPhone viewport
```

The UI suite drives the real app with the network stubbed — it logs a ride, saves one while
offline, confirms it queues rather than vanishing, reconnects, and verifies the queue drains
without duplicating. It also checks that every visible button clears a 44px touch target and that
the page never scrolls sideways on a phone.

`CHROMIUM_PATH` and `APP_URL` override the browser binary and server address.

## Stack

React 19, Vite, `vite-plugin-pwa`, Supabase, Recharts. Plain JavaScript, no TypeScript, hash-based
routing rather than a router. Styling is CSS custom properties in `src/styles.css` plus inline
style objects — one place to change a colour.

```
src/
  data/        store.js (offline queue), metrics.js (pure), dates.js
  features/    rides, body, journal, routes, progress, settings
  components/  shared UI
  settings.js  every tunable value, with bounds
db/            SQL migrations, applied in order
tests/         metrics.js (node), ui.js (playwright)
```

## Design notes

Dates resolve in one fixed program timezone, never the device's — a ride logged on a trip would
otherwise land on the wrong day and skew the weekly rollups.

Missing values stay missing. A ride with no recorded heart rate is not a ride at 0 bpm, so every
metric returns `null` rather than a confident zero, and the charts skip the point instead of
plotting a false floor.

Nothing is required except a date. A half-logged ride is far more useful than a skipped one.
