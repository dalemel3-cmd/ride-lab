/**
 * Live-recording logic: Bluetooth packet parsing, auto-pause, live pace.
 *
 * Pure functions, so this runs in Node with no browser and no strap:
 *   node tests/recording.js
 *
 * The Bluetooth parser matters most. Reading a heart-rate packet at the wrong
 * width does not throw — it produces a plausible-looking number, which would
 * quietly poison every zone, TRIMP, and segment heart rate for the ride.
 */

import {
  parseHeartRateMeasurement,
  currentSpeedMph,
  shouldAutoPause,
  climbSoFarMeters,
  movingDistanceMiles,
  latestElevationMeters,
  AUTO_PAUSE_MPH,
} from '../src/data/recording.js'

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

/** Build a DataView the way a strap would send one. */
function packet(bytes) {
  return new DataView(new Uint8Array(bytes).buffer)
}

console.log('\nBluetooth heart-rate packets')
// Flags byte 0x00 → bit 0 clear → the heart rate is a single byte.
check('uint8 format', parseHeartRateMeasurement(packet([0x00, 72])), 72)
check('a realistic riding heart rate', parseHeartRateMeasurement(packet([0x00, 165])), 165)

// Flags byte 0x01 → bit 0 set → two bytes, little-endian.
check('uint16 format, low byte first', parseHeartRateMeasurement(packet([0x01, 165, 0x00])), 165)
// 300 = 0x012C → little-endian [0x2C, 0x01]. Out of physiological range, so it
// must be rejected rather than reported.
check('an impossible rate is rejected', parseHeartRateMeasurement(packet([0x01, 0x2c, 0x01])), null)
// 260 = 0x0104 → [0x04, 0x01]. Reading this as uint8 would give 4.
check('a value above 255 needs both bytes', parseHeartRateMeasurement(packet([0x01, 0x04, 0x01])), 260)

// Other flag bits (sensor contact, energy expended, RR intervals) must not be
// mistaken for the width bit — 0x16 has bit 0 clear, so this is still uint8.
check('unrelated flag bits do not change the width', parseHeartRateMeasurement(packet([0x16, 148])), 148)

console.log('\nPackets that must not become numbers')
// A strap that has lost skin contact sends zero. Recording that would log a
// rider with no pulse and drag every average down.
check('a zero reading is a dropped strap, not a stopped heart', parseHeartRateMeasurement(packet([0x00, 0])), null)
check('a truncated packet is null', parseHeartRateMeasurement(packet([0x00])), null)
check('a uint16 packet missing its high byte is null', parseHeartRateMeasurement(packet([0x01, 165])), null)
check('null input is null', parseHeartRateMeasurement(null), null)
check('a non-DataView is null', parseHeartRateMeasurement({ nope: true }), null)

console.log('\nLive pace')
const LAT0 = 36.3729
const LON0 = -94.2088
const MI_PER_DEG_LAT = 69.0

/** Points a fixed distance apart in time and space, at a steady speed. */
function movingTrack({ mph, seconds, startMs = 1_700_000_000_000 }) {
  const pts = []
  for (let s = 0; s <= seconds; s += 1) {
    const miles = (mph * s) / 3600
    pts.push([LAT0 + miles / MI_PER_DEG_LAT, LON0, startMs + s * 1000, null, null])
  }
  return pts
}

const at12 = currentSpeedMph(movingTrack({ mph: 12, seconds: 30 }))
check('a steady 12 mph reads as 12', Math.abs(at12 - 12) < 0.4, true)
const at4 = currentSpeedMph(movingTrack({ mph: 4, seconds: 30 }))
check('a slow crawl reads as slow', Math.abs(at4 - 4) < 0.4, true)

console.log('\nPace with nothing to measure')
// Null, never zero: zero reads as "stopped" and would auto-pause a ride that
// simply has not produced two timed points yet.
check('one point has no speed', currentSpeedMph([[LAT0, LON0, 1, null, null]]), null)
check('an empty track has no speed', currentSpeedMph([]), null)
check('a null track has no speed', currentSpeedMph(null), null)
check(
  'points with no timestamps have no speed',
  currentSpeedMph([
    [LAT0, LON0, 0, null, null],
    [LAT0 + 0.001, LON0, 0, null, null],
  ]),
  null,
)

console.log('\nAuto-pause')
check(`stopped is below ${AUTO_PAUSE_MPH} mph`, shouldAutoPause(movingTrack({ mph: 0.5, seconds: 30 })), true)
check('riding is not paused', shouldAutoPause(movingTrack({ mph: 12, seconds: 30 })), false)
// A steep climb at walking pace is still riding, and pausing there would lose
// exactly the effort the study most wants to measure.
check('a slow climb is still riding', shouldAutoPause(movingTrack({ mph: 4, seconds: 30 })), false)
// Unknown speed must mean "keep recording". Pausing on an unsettled GPS would
// silently drop the first minutes of every ride.
check('an unknown speed does not pause', shouldAutoPause([]), false)
check('a single point does not pause', shouldAutoPause([[LAT0, LON0, 1, null, null]]), false)

console.log('\nMoving distance excludes drift while stopped')
// A stationary phone wanders a few metres between fixes. Counting that turns a
// five-minute stop into real mileage, which inflates distance, then average
// speed, then makes beats-per-mile look better than the rider earned.
function driftingTrack({ seconds, startMs = 1_700_000_000_000, metres = 3, baseLat = LAT0 }) {
  const pts = []
  for (let s = 0; s <= seconds; s += 1) {
    // Wander back and forth, never actually going anywhere.
    const offset = (s % 2 === 0 ? metres : -metres) / 1609.344
    pts.push([baseLat + offset / MI_PER_DEG_LAT, LON0, startMs + s * 1000, null, null])
  }
  return pts
}

const rode = movingTrack({ mph: 12, seconds: 60 })
check('a steady ride counts in full', Math.abs(movingDistanceMiles(rode) - 12 / 60) < 0.01, true)

const drifted = driftingTrack({ seconds: 120 })
const driftRaw = drifted.reduce(
  (sum, p, i) => (i ? sum + Math.abs(p[0] - drifted[i - 1][0]) * MI_PER_DEG_LAT : 0),
  0,
)
check('drift alone is real distance if unfiltered', driftRaw > 0.4, true)
check('but moving distance rejects it', movingDistanceMiles(drifted) < 0.02, true)

// A ride, then a two-minute stop. The drift must continue from where the ride
// ended, not teleport back to the origin — otherwise the test measures a
// 0.2-mile jump rather than a stop.
const stopStart = 1_700_000_000_000
const firstLeg = movingTrack({ mph: 12, seconds: 60, startMs: stopStart })
const mixed = [
  ...firstLeg,
  ...driftingTrack({
    seconds: 120,
    startMs: stopStart + 61_000,
    baseLat: firstLeg[firstLeg.length - 1][0],
  }),
]
// Some slack for the window's lag: for the first few seconds of a stop the
// window still contains riding, so a little drift slips through. That is tens
// of metres per stop against the half-mile an unfiltered sum would add.
check(
  'a stop in the middle does not add mileage',
  Math.abs(movingDistanceMiles(mixed) - 12 / 60) < 0.05,
  true,
)

console.log('\nMoving distance edge cases')
check('an empty track is zero', movingDistanceMiles([]), 0)
check('a single point is zero', movingDistanceMiles([[LAT0, LON0, 1, null, null]]), 0)
check('a null track is zero', movingDistanceMiles(null), 0)
// With no timestamps there is no speed to judge; the raw total is the only
// honest answer, and a silent zero would be much worse.
const untimedRide = movingTrack({ mph: 12, seconds: 60 }).map(([lat, lon]) => [lat, lon, 0, null, null])
check('an untimed track falls back to raw distance', movingDistanceMiles(untimedRide) > 0.15, true)

console.log('\nClimb so far')
const climbing = [
  [LAT0, LON0, 1, 100, null],
  [LAT0, LON0, 2, 112, null],
  [LAT0, LON0, 3, 108, null],
  [LAT0, LON0, 4, 120, null],
]
check('only ascent counts', climbSoFarMeters(climbing), 24)
check('a track with no altitude is unknown, not flat', climbSoFarMeters(movingTrack({ mph: 10, seconds: 5 })), null)

console.log('\nLatest elevation')
check('reads the most recent value', latestElevationMeters(climbing), 120)
// Altitude drops in and out with fix quality, so the last point often has none.
check(
  'skips back past points with no altitude',
  latestElevationMeters([...climbing, [LAT0, LON0, 5, null, null]]),
  120,
)
check('no altitude anywhere is null', latestElevationMeters([[LAT0, LON0, 1, null, null]]), null)

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
