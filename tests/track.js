/**
 * Track point accessors, VAM, and gradient.
 *
 * Pure functions, so this runs in Node with no browser and no server:
 *   node tests/track.js
 *
 * The case that matters most here is the old three-element point. Rides
 * recorded before elevation and heart rate were stored still sit in the same
 * jsonb column, and reading `point[3]` on one of those yields undefined — which
 * becomes NaN or 0 the instant it reaches arithmetic.
 */

import {
  latOf,
  lonOf,
  timeOf,
  elevationOf,
  heartRateOf,
  hasElevation,
  hasHeartRate,
  elevationGainMeters,
  averageHeartRate,
} from '../src/data/track.js'
import { vam, gradePercent } from '../src/data/metrics.js'

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

console.log('\nOld three-element points still read correctly')
const legacy = [36.37, -94.2, 1700000000000]
check('latitude', latOf(legacy), 36.37)
check('longitude', lonOf(legacy), -94.2)
check('time', timeOf(legacy), 1700000000000)
// The whole point of the accessors: undefined must not become 0.
check('missing elevation is null, not zero', elevationOf(legacy), null)
check('missing heart rate is null, not zero', heartRateOf(legacy), null)

console.log('\nNew five-element points')
const modern = [36.37, -94.2, 1700000000000, 412.5, 148]
check('elevation in metres', elevationOf(modern), 412.5)
check('heart rate', heartRateOf(modern), 148)

console.log('\nSentinels are treated as absent')
check('a zero timestamp is null, not 1970', timeOf([36.37, -94.2, 0]), null)
check('a zero heart rate is a dropped sensor', heartRateOf([36.37, -94.2, 1, 100, 0]), null)
check('an explicit null elevation is null', elevationOf([36.37, -94.2, 1, null, 140]), null)
check('a non-numeric elevation is null', elevationOf([36.37, -94.2, 1, 'n/a', 140]), null)
// Sea level is a real elevation and must survive.
check('zero elevation is kept', elevationOf([36.37, -94.2, 1, 0, 140]), 0)

console.log('\nDetecting what a track carries')
check('a legacy track has no elevation', hasElevation([legacy, legacy]), false)
check('a modern track does', hasElevation([legacy, modern]), true)
check('a legacy track has no heart rate', hasHeartRate([legacy, legacy]), false)
check('a modern track does', hasHeartRate([modern]), true)
check('a null track is handled', hasElevation(null), false)

console.log('\nElevation gain')
// Up 10, down 4, up 6 → 16 m of climb. Descent must not subtract.
const climb = [
  [0, 0, 1, 100, null],
  [0, 0, 2, 110, null],
  [0, 0, 3, 106, null],
  [0, 0, 4, 112, null],
]
check('only ascent counts', Math.round(elevationGainMeters(climb)), 16)

// The bug a real ride exposed. A phone logging every few seconds splits a climb
// into hundreds of sub-metre steps; rejecting each one as noise threw away the
// whole climb. The first GPX imported here had 262 rising samples, the largest
// 0.70 m, and reported 0 ft against a true 66 ft.
const slowClimb = []
for (let i = 0; i < 200; i += 1) slowClimb.push([0, 0, i * 1000, 100 + i * 0.4, null])
const slowGain = elevationGainMeters(slowClimb)
check('a steady climb in sub-metre steps is not discarded', slowGain > 70, true)
check('and is close to the real 79.6 m', Math.abs(slowGain - 79.6) < 6, true)

// The other direction still has to hold: jitter around a flat line is not climb.
const flatNoisy = []
for (let i = 0; i < 300; i += 1) flatNoisy.push([0, 0, i * 1000, 100 + Math.sin(i * 1.7) * 0.6, null])
check('jitter around a flat line stays near zero', elevationGainMeters(flatNoisy) < 3, true)
check('no elevation data is unknown, not flat', elevationGainMeters([legacy, legacy]), null)
// Sub-metre jitter is GPS noise, not climbing; summing it invents hundreds of
// phantom feet over a long ride.
const jitter = Array.from({ length: 50 }, (_, i) => [0, 0, i, 100 + (i % 2) * 0.4, null])
check('noise below a metre is ignored', elevationGainMeters(jitter), 0)

console.log('\nSegment heart rate')
check(
  'averaged over the points inside it',
  averageHeartRate([
    [0, 0, 1, null, 140],
    [0, 0, 2, null, 150],
    [0, 0, 3, null, 160],
  ]),
  150,
)
check('gaps are skipped, not counted as zero', averageHeartRate([[0, 0, 1, null, 150], legacy]), 150)
check('no heart rate at all is null', averageHeartRate([legacy, legacy]), null)

console.log('\nVAM (metres climbed per hour)')
// 300 m in 30 min = 600 m/h, squarely in the recreational range.
check('300 m in half an hour', vam(300, 30), 600)
check('a flat segment has no VAM', vam(0, 30), null)
check('missing climb is null', vam(null, 30), null)
check('missing duration is null', vam(300, null), null)
check('a blank string is absent, not zero', vam('', 30), null)

console.log('\nGradient')
// 1 mile is 1609.344 m; 160.9 m of climb over it is ~10%.
check('one mile at 160.9 m of climb', gradePercent(160.9344, 1), 10)
check('flat ground is zero percent', gradePercent(0, 1), 0)
check('no distance is null, not infinity', gradePercent(100, 0), null)

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
