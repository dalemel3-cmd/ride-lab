/**
 * GPS segment detection.
 *
 * Pure functions over hand-built tracks, so this runs in Node with no browser
 * and no server:
 *   node tests/segments.js
 *
 * Tracks are synthesised from a fixed origin so every expected distance can be
 * worked out by hand rather than read back off the implementation.
 */

import {
  resampleTrack,
  longestSharedRun,
  findSegments,
  MIN_SEGMENT_MI,
  MATCH_TOLERANCE_MI,
} from '../src/data/segments.js'
import { haversineMiles } from '../src/data/metrics.js'

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

// Bentonville, roughly. Due-north travel keeps the maths simple: one degree of
// latitude is ~69 miles everywhere, so distance is linear in the offset.
const LAT0 = 36.3729
const LON0 = -94.2088
const MI_PER_DEG_LAT = 69.0

/**
 * A straight northward track of `miles`, starting at `startMi` north of the
 * origin, sampled every `stepMi`, beginning at `startMs` and ridden at
 * `mph`.
 */
function northTrack({ startMi = 0, miles, stepMi = 0.02, startMs = 0, mph = 10 }) {
  const points = []
  const steps = Math.round(miles / stepMi)
  for (let i = 0; i <= steps; i += 1) {
    const travelled = startMi + i * stepMi
    const hours = (i * stepMi) / mph
    points.push([LAT0 + travelled / MI_PER_DEG_LAT, LON0, startMs + hours * 3600_000])
  }
  return points
}

/** Same shape, displaced far enough east to be unmistakably different ground. */
function eastwardOffsetTrack(track, offsetMi) {
  const lonPerMi = 1 / (MI_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180))
  return track.map(([lat, lon, t]) => [lat, lon + offsetMi * lonPerMi, t])
}

console.log('\nResampling')
const raw = northTrack({ miles: 1, stepMi: 0.25, mph: 12 })
const resampled = resampleTrack(raw)
check('a coarse track gains points', resampled.length > raw.length, true)
// 20 m spacing over a mile is ~80 points; allow for endpoint handling.
check('spacing is roughly 20 m', Math.abs(resampled.length - 81) <= 2, true)
check('it starts where the track starts', resampled[0][0], raw[0][0])
check(
  'total distance survives resampling',
  Math.abs(
    resampled.reduce((sum, p, i) => (i ? sum + haversineMiles(resampled[i - 1], p) : 0), 0) - 1,
  ) < 0.01,
  true,
)
check('timestamps are interpolated, not dropped', resampled[40][2] > 0, true)

console.log('\nUntimed tracks')
// gpx.js writes 0 for points with no timestamp; those must stay untimed rather
// than being read as the epoch, which would report an effort of 55 years.
const untimed = resampleTrack([
  [LAT0, LON0, 0],
  [LAT0 + 0.5 / MI_PER_DEG_LAT, LON0, 0],
])
check('a missing timestamp stays null', untimed[0][2], null)

console.log('\nShared ground')
const rideA = resampleTrack(northTrack({ miles: 2, mph: 10 }))
const rideB = resampleTrack(northTrack({ miles: 2, mph: 12 }))
const shared = longestSharedRun(rideA, rideB)
check('two rides of the same trail match', shared !== null, true)
check('the whole trail is matched', Math.abs(shared.distanceMi - 2) < 0.05, true)
check('travelling the same way is detected as forward', shared.step, 1)

console.log('\nOpposite directions')
// A trail ridden the other way is the same trail. Ignoring that would discard
// half the efforts in a study where out-and-back is the norm.
const reversed = resampleTrack([...northTrack({ miles: 2, mph: 10 })].reverse().map(
  ([lat, lon], i) => [lat, lon, i * 20_000],
))
const sharedReverse = longestSharedRun(rideA, reversed)
check('a reversed ride still matches', sharedReverse !== null, true)
check('and is detected as reversed', sharedReverse.step, -1)

console.log('\nDifferent ground')
const farAway = resampleTrack(eastwardOffsetTrack(northTrack({ miles: 2 }), 0.5))
check('a parallel trail half a mile away does not match', longestSharedRun(rideA, farAway), null)

console.log('\nPartial overlap')
// One ride covering the first two miles, another covering miles 1–3: they share
// exactly one mile.
const first2 = resampleTrack(northTrack({ startMi: 0, miles: 2 }))
const mid = resampleTrack(northTrack({ startMi: 1, miles: 2 }))
const overlap = longestSharedRun(first2, mid)
check('the shared mile is found', Math.abs(overlap.distanceMi - 1) < 0.05, true)

console.log('\nToo short to count')
const tinyA = resampleTrack(northTrack({ miles: 0.1 }))
const tinyB = resampleTrack(northTrack({ miles: 0.1 }))
check(
  `a shared stretch under ${MIN_SEGMENT_MI} mi is rejected`,
  longestSharedRun(tinyA, tinyB),
  null,
)

console.log('\nGPS drift is tolerated')
// Every point nudged ~20 m east: inside tolerance, so the same trail on a
// cloudy day under tree cover still matches itself.
const drifted = resampleTrack(eastwardOffsetTrack(northTrack({ miles: 2 }), 20 / 1609.344))
check('drift within tolerance still matches', longestSharedRun(rideA, drifted) !== null, true)
check('the tolerance is 35 m', Math.round(MATCH_TOLERANCE_MI * 1609.344), 35)

console.log('\nSegments across a study')
const rides = [
  { id: 'r1', ridden_at: '2026-05-01T14:00:00Z', route_name: 'Slaughter Pen', avg_hr: 160, track: northTrack({ miles: 2, mph: 9, startMs: Date.UTC(2026, 4, 1, 14) }) },
  { id: 'r2', ridden_at: '2026-06-01T14:00:00Z', route_name: 'Slaughter Pen', avg_hr: 152, track: northTrack({ miles: 2, mph: 11, startMs: Date.UTC(2026, 5, 1, 14) }) },
  { id: 'r3', ridden_at: '2026-07-01T14:00:00Z', route_name: 'Coler', avg_hr: 150, track: eastwardOffsetTrack(northTrack({ miles: 2, mph: 10 }), 3) },
]
const segments = findSegments(rides)
check('one shared segment is found', segments.length, 1)
check('both efforts on it are recorded', segments[0].efforts.length, 2)
check('unrelated ground is not folded in', segments[0].efforts.some((e) => e.rideId === 'r3'), false)
check('efforts are oldest first', segments[0].efforts.map((e) => e.rideId), ['r1', 'r2'])
check('the faster later effort is the PR', segments[0].fastest.rideId, 'r2')
check('getting faster shows as a negative change', segments[0].timeChangeMin < 0, true)
check('the heart-rate drop is reported', segments[0].hrChange, -8) // 152 − 160
check('segment distance is the shared ground, not the ride', Math.abs(segments[0].distanceMi - 2) < 0.05, true)

console.log('\nA single ride proves nothing')
check('one ride yields no segments', findSegments([rides[0]]), [])
check('no rides yields no segments', findSegments([]), [])
check('no arguments yields no segments', findSegments(), [])

console.log('\nRides without GPS are ignored, not guessed at')
// Manually entered rides have no track. They must not crash matching and must
// not be invented into efforts.
check(
  'a ride with no track is skipped',
  findSegments([{ id: 'm1', ridden_at: '2026-05-02T14:00:00Z', track: null }, rides[0]]),
  [],
)

console.log('\nAn untimed effort is reported as untimed')
const untimedRides = [
  { id: 'u1', ridden_at: '2026-05-01T14:00:00Z', avg_hr: 150, track: northTrack({ miles: 2 }).map(([lat, lon]) => [lat, lon, 0]) },
  { id: 'u2', ridden_at: '2026-06-01T14:00:00Z', avg_hr: 150, track: northTrack({ miles: 2 }).map(([lat, lon]) => [lat, lon, 0]) },
]
const untimedSegments = findSegments(untimedRides)
check('the segment is still found', untimedSegments.length, 1)
check('but no duration is invented', untimedSegments[0].efforts[0].durationMin, null)
check('and there is no PR to claim', untimedSegments[0].fastest, null)
check('nor a trend', untimedSegments[0].timeChangeMin, null)

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
