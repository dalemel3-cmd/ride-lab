/**
 * Metrics tests.
 *
 * These functions produce the numbers the case study actually claims, so they
 * are checked against values worked out by hand rather than against whatever
 * the code happened to return. Run with: node tests/metrics.js
 *
 * Plain Node, no test framework — one file, no dependency to install, and the
 * output says what was expected next to what came back.
 */

import assert from 'node:assert/strict'
import {
  avgSpeed,
  predictedMaxHr,
  hrZone,
  hrZoneRanges,
  trainingLoad,
  estimateVo2Max,
  haversineMiles,
  trackDistanceMiles,
  weeklyRollup,
  trendDelta,
  beatsPerMile,
  efficiencyFactor,
  summarize,
} from '../src/data/metrics.js'
import { startOfWeek, daysBetween, studyWeek, formatDuration, formatStopwatch } from '../src/data/dates.js'

let passed = 0
let failed = 0

function check(name, actual, expected) {
  try {
    assert.deepEqual(actual, expected)
    console.log(`  ok   ${name} → ${JSON.stringify(actual)}`)
    passed += 1
  } catch {
    console.error(`  FAIL ${name}`)
    console.error(`       expected: ${JSON.stringify(expected)}`)
    console.error(`       actual:   ${JSON.stringify(actual)}`)
    failed += 1
  }
}

/** Floating-point comparison with a tolerance. */
function checkClose(name, actual, expected, tolerance = 0.01) {
  const ok = actual != null && Math.abs(actual - expected) <= tolerance
  if (ok) {
    console.log(`  ok   ${name} → ${actual}`)
    passed += 1
  } else {
    console.error(`  FAIL ${name}`)
    console.error(`       expected: ${expected} (±${tolerance})`)
    console.error(`       actual:   ${actual}`)
    failed += 1
  }
}

console.log('\navgSpeed')
checkClose('20 mi in 60 min = 20 mph', avgSpeed(20, 60), 20)
checkClose('10 mi in 45 min ≈ 13.33 mph', avgSpeed(10, 45), 13.333)
check('zero duration is null, not Infinity', avgSpeed(10, 0), null)
// Number(null) and Number('') are both 0, which is finite — without an explicit
// guard a ride with no distance recorded reports a confident 0 mph.
check('missing distance is null, not 0 mph', avgSpeed(null, 60), null)
check('empty-string distance is null, not 0 mph', avgSpeed('', 60), null)
check('undefined distance is null', avgSpeed(undefined, 60), null)

console.log('\npredictedMaxHr (Tanaka: 208 − 0.7 × age)')
check('age 30 → 187', predictedMaxHr(30), 187)
check('age 50 → 173', predictedMaxHr(50), 173)
check('no age → null', predictedMaxHr(null), null)

console.log('\nhrZone')
check('130 of 190 (68%) is zone 2', hrZone(130, 190)?.zone, 2)
check('150 of 190 (79%) is zone 3', hrZone(150, 190)?.zone, 3)
check('160 of 190 (84%) is zone 4', hrZone(160, 190)?.zone, 4)
check('180 of 190 (95%) is zone 5', hrZone(180, 190)?.zone, 5)
check('at max is still zone 5, not undefined', hrZone(190, 190)?.zone, 5)
check('above max clamps to zone 5', hrZone(200, 190)?.zone, 5)
check('very low HR floors at zone 1', hrZone(70, 190)?.zone, 1)
check('missing HR is null', hrZone(null, 190), null)

console.log('\nhrZoneRanges')
const ranges = hrZoneRanges(190)
check('produces five zones', ranges.length, 5)
check('zone 2 spans 114–133 bpm', [ranges[1].lowBpm, ranges[1].highBpm], [114, 133])
check('zone 5 tops out at max, not above', ranges[4].highBpm, 190)
check('no max HR → empty', hrZoneRanges(0), [])

console.log('\ntrainingLoad (session RPE: rpe × minutes)')
check('60 min at RPE 5 = 300', trainingLoad(5, 60), 300)
check('30 min at RPE 8 = 240', trainingLoad(8, 30), 240)
check('missing RPE is null, not 0', trainingLoad(null, 60), null)
check('zero duration is null', trainingLoad(5, 0), null)

console.log('\nestimateVo2Max (Uth–Sørensen: 15.3 × max/rest)')
// 15.3 × (190/60) = 48.45 → 48.5 at one decimal place.
check('max 190, rest 60 → 48.5', estimateVo2Max(60, 190), 48.5)
check('max 190, rest 50 → 58.1', estimateVo2Max(50, 190), 58.1)
check('a lower resting HR estimates a higher VO2 max', estimateVo2Max(50, 190) > estimateVo2Max(60, 190), true)
check('missing resting HR → null', estimateVo2Max(null, 190), null)
check('empty-string resting HR → null, not Infinity', estimateVo2Max('', 190), null)

console.log('\nhaversineMiles')
// One degree of latitude is ~69 miles anywhere on Earth.
checkClose('1° of latitude ≈ 69 mi', haversineMiles([36, -94], [37, -94]), 69.09, 0.2)
check('identical points = 0', haversineMiles([36, -94], [36, -94]), 0)
check('garbage input = 0, not NaN', haversineMiles(null, [36, -94]), 0)

console.log('\ntrackDistanceMiles')
check('a single point has no distance', trackDistanceMiles([[36, -94, 0]]), 0)
check('empty track = 0', trackDistanceMiles([]), 0)
check('null track = 0', trackDistanceMiles(null), 0)
checkClose(
  'three points sum their legs',
  trackDistanceMiles([
    [36.0, -94.0, 0],
    [36.1, -94.0, 1],
    [36.2, -94.0, 2],
  ]),
  13.82,
  0.1,
)

console.log('\nbeatsPerMile — the headline metric')
// 150 bpm for 60 min = 9000 beats, over 15 miles = 600 beats/mile.
check('150 bpm, 60 min, 15 mi = 600', beatsPerMile(150, 60, 15), 600)
check('fitter: 140 bpm, 60 min, 18 mi = 467', beatsPerMile(140, 60, 18), 467)
check('missing HR → null', beatsPerMile(null, 60, 15), null)
check('zero distance → null, not Infinity', beatsPerMile(150, 60, 0), null)

console.log('\nefficiencyFactor')
checkClose('15 mi / 60 min at 150 bpm = 0.1', efficiencyFactor(15, 60, 150), 0.1, 0.001)
check('missing HR → null', efficiencyFactor(15, 60, null), null)

console.log('\ntrendDelta')
check('improving resting HR is flagged as improved', trendDelta([62, 55], { lowerIsBetter: true })?.improved, true)
check('rising resting HR is not improved', trendDelta([55, 62], { lowerIsBetter: true })?.improved, false)
check('rising VO2 max is improved', trendDelta([45, 52])?.improved, true)
check('change is computed', trendDelta([62, 55], { lowerIsBetter: true })?.change, -7)
checkClose('percent change', trendDelta([100, 90], { lowerIsBetter: true })?.pctChange, -10)
check('a single value has no trend', trendDelta([55]), null)
check('non-numeric values are ignored', trendDelta([null, undefined]), null)

console.log('\nweeklyRollup')
const rides = [
  { ridden_at: '2026-05-04T12:00:00Z', distance_mi: 10, duration_min: 60, elevation_ft: 500, rpe: 5 },
  { ridden_at: '2026-05-06T12:00:00Z', distance_mi: 12, duration_min: 70, elevation_ft: 600, rpe: 6 },
  { ridden_at: '2026-05-12T12:00:00Z', distance_mi: 20, duration_min: 120, elevation_ft: 900, rpe: 7 },
]
const weeks = weeklyRollup(rides)
check('groups into two weeks', weeks.length, 2)
check('oldest week first, for charting', weeks[0].week < weeks[1].week, true)
check('first week has two rides', weeks[0].rides, 2)
check('first week distance sums', weeks[0].distanceMi, 22)
check('first week load = 5×60 + 6×70 = 720', weeks[0].load, 720)
check('rides with no date are skipped', weeklyRollup([{ distance_mi: 5 }]).length, 0)

console.log('\nsummarize')
const totals = summarize(rides)
check('counts every ride', totals.rides, 3)
check('sums distance', totals.distanceMi, 42)
check('sums elevation', totals.elevationFt, 2000)
check('total load = 720 + 840', totals.load, 1560)
check('empty input does not crash', summarize([]).rides, 0)

console.log('\ndates')
check('startOfWeek anchors to Monday', startOfWeek('2026-05-06'), '2026-05-04')
check('a Monday is its own week start', startOfWeek('2026-05-04'), '2026-05-04')
check('a Sunday belongs to the week that started Monday', startOfWeek('2026-05-10'), '2026-05-04')
check('daysBetween counts forward', daysBetween('2026-05-01', '2026-05-08'), 7)
check('daysBetween goes negative backwards', daysBetween('2026-05-08', '2026-05-01'), -7)
check('study week 1 is the start date itself', studyWeek('2026-05-01', '2026-05-01'), 1)
check('day 7 is still week 1', studyWeek('2026-05-01', '2026-05-07'), 1)
check('day 8 is week 2', studyWeek('2026-05-01', '2026-05-08'), 2)
check('before the study starts is week 0', studyWeek('2026-05-01', '2026-04-01'), 0)
check('formatDuration under an hour', formatDuration(48), '48m')
check('formatDuration over an hour', formatDuration(84), '1h 24m')
check('formatStopwatch pads seconds', formatStopwatch(84000), '1:24')
check('formatStopwatch adds hours', formatStopwatch(5047000), '1:24:07')

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
