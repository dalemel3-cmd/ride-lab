/**
 * Ride with GPS trip → ride mapping.
 *
 * Checked against the exact example payload published in the Ride with GPS API
 * documentation (endpoints/trips.md), because every one of these numbers ends
 * up in the case study. Unit conversions are worked out by hand here rather
 * than copied from what the code returned.
 *
 * The module under test is Deno/TypeScript, so it is transpiled on the fly by
 * stripping the type annotations — there is no TypeScript toolchain in this
 * project and adding one for a single file is not worth it. The transform is
 * deliberately narrow and asserted below.
 *
 *   node tests/ridewithgps.js
 */

import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let passed = 0
let failed = 0

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    console.log(`  ok   ${name} → ${JSON.stringify(actual)}`)
    passed += 1
  } else {
    console.error(`  FAIL ${name}`)
    console.error(`       expected: ${JSON.stringify(expected)}`)
    console.error(`       actual:   ${JSON.stringify(actual)}`)
    failed += 1
  }
}

// ---- Load the Deno module as plain JS -------------------------------------
const source = readFileSync(
  new URL('../supabase/functions/_shared/ridewithgps.ts', import.meta.url),
  'utf8',
)

const stripped = source
  // `export type X = ...` and `type X = ...` declarations, single line.
  .replace(/^export type .*$/gm, '')
  .replace(/^type .*$/gm, '')
  // Return type annotations and parameter types. Narrow on purpose: this file
  // is written to stay within what these two rules can handle.
  .replace(/: (Record<string, unknown> \| null \| undefined|Record<string, unknown> \| null|Record<string, unknown>|TrackPoint\[\]|TrackPoint|string \| null|number \| null|boolean|unknown|string|number)(?=[,)\s=])/g, '')
  .replace(/ as (TrackPoint|number|string|Record<string, unknown>\[\]|Record<string, unknown>)/g, '')

const dir = mkdtempSync(join(tmpdir(), 'rwgps-'))
const file = join(dir, 'ridewithgps.mjs')
writeFileSync(file, stripped)

const { tripToRide, toTrack, surfaceForActivityType, isCyclingTrip, trackHasHeartRate } =
  await import(`file://${file}`)

// Prove the transpile did not quietly produce a broken module.
assert.equal(typeof tripToRide, 'function', 'tripToRide must load')
assert.equal(typeof toTrack, 'function', 'toTrack must load')

const USER = '00000000-0000-4000-8000-000000000001'

// ---- The documented example payload ---------------------------------------
// Verbatim from https://ridewithgps.com/api → endpoints/trips.md
const DOC_TRIP = {
  id: 1,
  name: 'Morning Ride',
  description: null,
  departed_at: '2008-01-05T11:25:03-08:00',
  time_zone: 'America/Los_Angeles',
  activity_type: 'cycling:gravel',
  is_stationary: false,
  distance: 16146,
  duration: 2705,
  moving_time: 2456,
  elevation_gain: 363,
  elevation_loss: 352,
  avg_speed: 23.7,
  max_speed: 49.3,
  avg_cad: 77,
  min_cad: 10,
  max_cad: 115,
  avg_hr: 163,
  min_hr: 92,
  max_hr: 238,
  avg_watts: 289,
  min_watts: null,
  max_watts: null,
  calories: 711,
  user_id: 1,
  device: 'Garmin Edge 540',
  track_points: [
    { x: -123.073723, y: 44.012199, e: 158.2, s: 0, t: 1199561107, h: 92, c: 0 },
    { x: -123.073792, y: 44.012196, e: 156.8, s: 2.27, t: 1199561109, h: 92, c: 0 },
    { x: -123.073952, y: 44.012169, e: 152.9, s: 3.06, t: 1199561113, h: 93, c: 0 },
  ],
}

console.log('\nThe documented example trip')
const ride = tripToRide(DOC_TRIP, USER)

check('is imported as a ride', ride !== null, true)
check('carries the source that makes re-syncing idempotent', ride.source, 'ridewithgps')
check('and the trip id as external_id', ride.external_id, '1')
check('keeps the departure instant, not a date', ride.ridden_at, '2008-01-05T11:25:03-08:00')
check('takes the trip name as the route name', ride.route_name, 'Morning Ride')

// 16146 m × 0.000621371 = 10.0327… mi
check('converts metres to miles', ride.distance_mi, 10.03)
// moving_time 2456 s ÷ 60 = 40.933… min. Elapsed 2705 s would be 45.1 — the
// difference is four minutes of standing still, which is not training time.
check('uses moving time, not elapsed', ride.duration_min, 40.9)
check('and elapsed time would have been a different number', Math.round((2705 / 60) * 10) / 10, 45.1)
// 363 m × 3.28084 = 1190.9… ft
check('converts elevation gain to feet', ride.elevation_ft, 1191)

check('takes average heart rate', ride.avg_hr, 163)
// 238 is inside the rides table's 30–240 CHECK, so it survives.
check('and a max of 238 is within the allowed range', ride.max_hr, 238)
check('takes cadence', ride.cadence_avg_rpm, 77)
check('takes average power', ride.power_avg_watts, 289)
check('null max power stays null', ride.power_max_watts, null)
check('takes calories', ride.calories, 711)
check('maps cycling:gravel to gravel', ride.surface, 'gravel')
// The whole point of the study's subjective axis: no device measures it.
check('never invents an RPE', ride.rpe, null)

console.log('\nTrack points')
check('every point is kept', ride.track.length, 3)
// The contract src/data/track.js documents and every reader assumes:
// [lat, lon, epochMs, elevationM, heartRate].
check(
  'first point is [lat, lon, epochMs, elevationM, hr]',
  ride.track[0],
  [44.012199, -123.073723, 1199561107000, 158.2, 92],
)
// Absolute, not rebased. An earlier version stored seconds-from-start, which
// made timeInZones read a 43-minute ride as 2.6 seconds of training — and,
// because track.js treats a time of 0 as "no timestamp", quietly dropped the
// first point of every imported ride.
check('time is epoch milliseconds', ride.track[2][2], 1199561113000)
check('and six seconds separate points 1 and 3', (ride.track[2][2] - ride.track[0][2]) / 1000, 6)
// Metres, as GPX stores them. Feet are a display-time conversion; storing them
// here made 390 m of Ozark plateau render as 4,196 ft.
check('elevation stays in metres', ride.track[2][3], 152.9)
check('heart rate survives per point', ride.track.map((p) => p[4]), [92, 92, 93])
check('so the trace is usable for time-in-zones', trackHasHeartRate(ride.track), true)

console.log('\nWhat must not be imported')
check('a run is not a ride', tripToRide({ ...DOC_TRIP, activity_type: 'running:generic' }, USER), null)
check('nor is a motorcycle', tripToRide({ ...DOC_TRIP, activity_type: 'motorcycling:atv' }, USER), null)
check('a trip with no id is skipped', tripToRide({ ...DOC_TRIP, id: null }, USER), null)
check('null is skipped', tripToRide(null, USER), null)
// A cycling app with no activity_type set is still recording rides; dropping
// those would silently lose them.
check('an untyped trip is assumed to be a ride', isCyclingTrip({ activity_type: null }), true)
check('but it gets no surface guessed for it', surfaceForActivityType(null), null)

console.log('\nSurface mapping')
check('mountain is singletrack', surfaceForActivityType('cycling:mountain'), 'singletrack')
check('cyclocross is singletrack', surfaceForActivityType('cycling:cyclocross'), 'singletrack')
check('gravel is gravel', surfaceForActivityType('cycling:gravel'), 'gravel')
check('road is road', surfaceForActivityType('cycling:road'), 'road')
check('commute is road', surfaceForActivityType('cycling:commute'), 'road')
check('an unknown type gets no surface rather than a guess', surfaceForActivityType('cycling:new'), null)

console.log('\nValues the rides table would reject')
// Each of these violates a CHECK constraint. A single bad value fails the whole
// batch upsert, not just its own row, so they are dropped rather than sent.
check('a heart rate of 300 is dropped, not sent', tripToRide({ ...DOC_TRIP, avg_hr: 300 }, USER).avg_hr, null)
check('a heart rate of 0 is dropped', tripToRide({ ...DOC_TRIP, avg_hr: 0 }, USER).avg_hr, null)
check('cadence of 5 is below the 20 floor', tripToRide({ ...DOC_TRIP, avg_cad: 5 }, USER).cadence_avg_rpm, null)
check('power of 9000 is dropped', tripToRide({ ...DOC_TRIP, avg_watts: 9000 }, USER).power_avg_watts, null)
// A dropped strap reads as zero, which is not a heart rate.
check(
  'a zero heart rate in the trace becomes null, not 0 bpm',
  toTrack([
    { x: 1, y: 2, t: 100, h: 0 },
    { x: 1.1, y: 2.1, t: 101, h: 140 },
  ]).map((p) => p[4]),
  [null, 140],
)

console.log('\nDegenerate tracks')
check('no track points means no track', tripToRide({ ...DOC_TRIP, track_points: [] }, USER).track, null)
check('a missing key means no track', tripToRide({ ...DOC_TRIP, track_points: undefined }, USER).track, null)
// One point is a start location, not a route.
check(
  'a single point is not a route',
  tripToRide({ ...DOC_TRIP, track_points: [{ x: 1, y: 2, t: 1 }] }, USER).track,
  null,
)
check(
  'points without coordinates are dropped',
  toTrack([{ t: 1, h: 100 }, { x: 1, y: 2, t: 2, h: 101 }]).length,
  1,
)
check(
  'a track with no timestamps still maps',
  toTrack([{ x: 1, y: 2 }, { x: 1.1, y: 2.1 }]).map((p) => p[2]),
  [null, null],
)
// track.js reads 0 at position 2 as "no timestamp", so writing a literal zero
// would date the point to 1970 for anything that did not check.
check(
  'a zero timestamp becomes null rather than the epoch',
  toTrack([{ x: 1, y: 2, t: 0 }])[0][2],
  null,
)
check(
  'a missing elevation stays null, not zero metres',
  toTrack([{ x: 1, y: 2, t: 5 }])[0][3],
  null,
)
check('a ride with no heart rate reports so', trackHasHeartRate(toTrack([{ x: 1, y: 2 }])), false)

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
