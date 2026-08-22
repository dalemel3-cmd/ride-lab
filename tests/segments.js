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
// These tracks predate per-point heart rate, so the trend falls back to the
// ride average — and says so, rather than passing it off as the segment's.
check('and is labelled as a whole-ride figure', segments[0].hrChangeSource, 'ride')
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

console.log('\nPer-point elevation and heart rate')
/** A climbing track: gains `climbM` metres evenly, at a steady heart rate. */
function climbTrack({ miles = 1, climbM, hr, mph, startMs = 0 }) {
  const pts = []
  const steps = Math.round(miles / 0.02)
  for (let i = 0; i <= steps; i += 1) {
    const mi = i * 0.02
    pts.push([
      LAT0 + mi / MI_PER_DEG_LAT,
      LON0,
      startMs + (mi / mph) * 3600_000,
      100 + (climbM * i) / steps,
      hr,
    ])
  }
  return pts
}

const climbRides = [
  { id: 'c1', ridden_at: '2026-05-01T14:00:00Z', avg_hr: 999, track: climbTrack({ climbM: 100, hr: 168, mph: 6, startMs: Date.UTC(2026, 4, 1, 14) }) },
  { id: 'c2', ridden_at: '2026-07-01T14:00:00Z', avg_hr: 999, track: climbTrack({ climbM: 100, hr: 152, mph: 8, startMs: Date.UTC(2026, 6, 1, 14) }) },
]
const climbSegs = findSegments(climbRides)
check('the climb is found as a segment', climbSegs.length, 1)
// The whole point of storing per-point heart rate: this must be the segment's
// own average (168 / 152), never the bogus ride-wide 999 used as a tell.
check('heart rate is the segment\'s own', climbSegs[0].efforts.map((e) => e.avgHr), [168, 152])
check('the ride average is kept separately as context', climbSegs[0].efforts[0].rideAvgHr, 999)
check('segment climb is measured', Math.abs(climbSegs[0].elevationGainM - 100) <= 2, true)
// 1 mile at 6 mph = 10 min for 100 m → 600 m/h. At 8 mph = 7.5 min → 800 m/h.
// The matched stretch is fractionally shorter than the full mile, so allow a
// couple of percent rather than pinning the figure exactly.
const vams = climbSegs[0].efforts.map((e) => e.vam)
check('VAM is computed per effort', [Math.abs(vams[0] - 600) < 15, Math.abs(vams[1] - 800) < 20], [true, true])
check('and rises with fitness', vams[1] > vams[0], true)
check('the best VAM is the later, fitter one', climbSegs[0].bestVam.rideId, 'c2')
// 100 m over a mile is ~6.2%.
check('gradient is reported', Math.abs(climbSegs[0].gradePercent - 6.2) < 0.3, true)
check('the heart-rate drop is the segment\'s', climbSegs[0].hrChange, -16)
check('and is labelled as measured over the segment', climbSegs[0].hrChangeSource, 'segment')

console.log('\nLegacy tracks still work')
// Rides recorded before the tuple was widened carry three-element points. They
// must still match, and must report no invented elevation or segment HR.
const legacyRides = [
  { id: 'l1', ridden_at: '2026-05-01T14:00:00Z', avg_hr: 160, track: northTrack({ miles: 2, mph: 9, startMs: Date.UTC(2026, 4, 1, 14) }) },
  { id: 'l2', ridden_at: '2026-07-01T14:00:00Z', avg_hr: 150, track: northTrack({ miles: 2, mph: 11, startMs: Date.UTC(2026, 6, 1, 14) }) },
]
const legacySegs = findSegments(legacyRides)
check('a legacy segment is still found', legacySegs.length, 1)
check('no segment heart rate is invented', legacySegs[0].efforts[0].avgHr, null)
check('the ride average is still offered', legacySegs[0].efforts[0].rideAvgHr, 160)
check('no elevation is invented', legacySegs[0].elevationGainM, null)
check('and therefore no VAM', legacySegs[0].efforts[0].vam, null)
check('nor a gradient', legacySegs[0].gradePercent, null)

console.log('\nA flat modern segment claims no climb')
const flat = findSegments([
  { id: 'f1', ridden_at: '2026-05-01T14:00:00Z', track: climbTrack({ climbM: 0, hr: 140, mph: 10, startMs: Date.UTC(2026, 4, 1, 14) }) },
  { id: 'f2', ridden_at: '2026-06-01T14:00:00Z', track: climbTrack({ climbM: 0, hr: 138, mph: 10, startMs: Date.UTC(2026, 5, 1, 14) }) },
])
check('flat ground gains nothing', flat[0].elevationGainM, 0)
check('and has no VAM to report', flat[0].efforts[0].vam, null)

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
