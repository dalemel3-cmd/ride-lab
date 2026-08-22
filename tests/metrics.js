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
  efficiencyBySurface,
  routeProgress,
  summarize,
  trimp,
  performanceManagementChart,
  hrvAutonomicBands,
  dailyReadiness,
  substrateOxidation,
  timeInZones,
  combineZoneTimes,
  acwr,
  fosterMonotonyAndStrain,
  weeklyMonotony,
  polarizedAudit,
} from '../src/data/metrics.js'
import {
  startOfWeek,
  daysBetween,
  studyWeek,
  formatDuration,
  formatStopwatch,
  recordDate,
  toDateString,
} from '../src/data/dates.js'

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

console.log('\nefficiencyBySurface — terrain must not masquerade as fitness')
// A rider who improves on pavement but then switches to singletrack looks like
// they got worse if the surfaces are pooled. They must not be pooled.
const mixed = [
  { ridden_at: '2026-05-01T12:00:00Z', avg_hr: 150, duration_min: 60, distance_mi: 15, surface: 'paved-trail' },
  { ridden_at: '2026-05-08T12:00:00Z', avg_hr: 140, duration_min: 60, distance_mi: 16, surface: 'paved-trail' },
  { ridden_at: '2026-05-15T12:00:00Z', avg_hr: 160, duration_min: 90, distance_mi: 10, surface: 'singletrack' },
]
const surfaces = efficiencyBySurface(mixed)
check('splits by surface', surfaces.length, 2)
check('most-ridden surface leads', surfaces[0].surface, 'paved-trail')
check('pavement trend is computed within its own group', surfaces[0].trend?.improved, true)
// Pooled, the last ride (1440 beats/mi on dirt) would swamp the pavement trend.
check('singletrack is kept separate', surfaces[1].points.length, 1)
check('rides with no heart rate are excluded', efficiencyBySurface([{ ridden_at: '2026-05-01T12:00:00Z', distance_mi: 10 }]).length, 0)

console.log('\nrouteProgress — same trail, then vs now')
const repeated = [
  { ridden_at: '2026-05-01T12:00:00Z', route_name: 'Slaughter Pen Loop', avg_hr: 160, duration_min: 55, distance_mi: 8.5 },
  { ridden_at: '2026-06-01T12:00:00Z', route_name: 'Slaughter Pen Loop', avg_hr: 147, duration_min: 43, distance_mi: 8.5 },
  { ridden_at: '2026-05-10T12:00:00Z', route_name: 'Back 40', avg_hr: 150, duration_min: 130, distance_mi: 20 },
]
const gains = routeProgress(repeated)
check('only routes ridden twice or more appear', gains.length, 1)
check('names the route', gains[0].route, 'Slaughter Pen Loop')
check('counts the rides', gains[0].rides, 2)
check('faster on the same trail is an improvement', gains[0].speed?.improved, true)
check('fewer beats on the same trail is an improvement', gains[0].beatsPerMile?.improved, true)
check('a route ridden once is excluded', routeProgress([repeated[2]]).length, 0)
check('rides with no route name are ignored', routeProgress([{ ridden_at: '2026-05-01T12:00:00Z' }]).length, 0)

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
// A 7pm Central ride is stored as 00:00Z the next day. Slicing the ISO string
// reads the UTC date and files the ride under tomorrow, disagreeing with the
// week header and the edit form. Evening rides are most rides.
check(
  'an evening ride keeps its own calendar date',
  recordDate({ ridden_at: '2026-08-18T00:00:00.000Z' }),
  '2026-08-17',
)
check(
  'a midday ride is unaffected',
  recordDate({ ridden_at: '2026-08-17T17:00:00.000Z' }),
  '2026-08-17',
)
check(
  'recordDate agrees with the value used for grouping',
  recordDate({ ridden_at: '2026-08-18T02:30:00.000Z' }),
  toDateString(new Date('2026-08-18T02:30:00.000Z')),
)
check('a missing timestamp falls back to today', recordDate({}), toDateString())
check('an unparseable timestamp falls back to today', recordDate({ ridden_at: 'nonsense' }), toDateString())
check('reads other date fields too', recordDate({ measured_at: '2026-08-18T00:00:00.000Z' }, 'measured_at'), '2026-08-17')

check('formatDuration under an hour', formatDuration(48), '48m')
check('formatDuration over an hour', formatDuration(84), '1h 24m')
check('formatStopwatch pads seconds', formatStopwatch(84000), '1:24')
check('formatStopwatch adds hours', formatStopwatch(5047000), '1:24:07')

console.log('\nBanister TRIMP (Training Impulse)')
checkClose('60 min at 150 bpm, max 190, rest 60', trimp(150, 60, 190, 60), 100.4, 0.5)
check('missing HR is null', trimp(null, 60, 190), null)
check('zero duration is null', trimp(150, 0, 190), null)
check('HR below resting is null', trimp(50, 60, 190, 60), null)

console.log('\nPerformance Management Chart (PMC)')
const pmcTestRides = [
  { ridden_at: '2026-05-01T12:00:00Z', avg_hr: 150, duration_min: 60, rpe: 6 },
  { ridden_at: '2026-05-02T12:00:00Z', avg_hr: 160, duration_min: 45, rpe: 7 },
]
const pmcResult = performanceManagementChart(pmcTestRides)
check('generates daily timeseries', pmcResult.length > 0, true)
check('first day has positive CTL and ATL', pmcResult[0].ctl > 0 && pmcResult[0].atl > 0, true)
check('TSB equals CTL - ATL', Math.round((pmcResult[0].ctl - pmcResult[0].atl) * 10) / 10, pmcResult[0].tsb)

console.log('\nHRV Autonomic Bands (SWC)')
const hrvTestData = [
  { measured_at: '2026-05-01', hrv_ms: 80 },
  { measured_at: '2026-05-02', hrv_ms: 85 },
  { measured_at: '2026-05-03', hrv_ms: 82 },
]
const hrvResult = hrvAutonomicBands(hrvTestData)
check('produces band outputs for valid data', hrvResult.length, 3)
check('upper band is greater than baseline', hrvResult[2].upperBand >= hrvResult[2].baselineHrv, true)
check('lower band is less than baseline', hrvResult[2].lowerBand <= hrvResult[2].baselineHrv, true)

console.log('\nDaily Readiness')
const readyGreen = dailyReadiness({ hrv: 85, hrvBaseline: 80, restingHr: 50, restingHrBaseline: 52, recentTsb: 10 })
check('green zone for optimal readiness', readyGreen.zone, 'green')
const readyRed = dailyReadiness({ hrv: 55, hrvBaseline: 80, restingHr: 62, restingHrBaseline: 52, recentTsb: -35 })
check('red zone for high fatigue/overreaching', readyRed.zone, 'red')
check('a full score reports all three signals', readyGreen.inputs, 3)

// The neutral 75 is an anchor for real signals to move, not an answer. Before
// this guard, an empty database scored 75 + 2 (from a TSB defaulted to zero)
// and told every new rider they were at "Optimal Readiness" — a fabricated
// number that never changed.
check('no inputs yields no score at all', dailyReadiness({}), null)
check('no arguments yields no score at all', dailyReadiness(), null)
check(
  'an absent training balance does not manufacture a score',
  dailyReadiness({ hrv: null, restingHr: null, recentTsb: null }),
  null,
)
check(
  'blank strings are absent, not zero',
  dailyReadiness({ hrv: '', hrvBaseline: '', restingHr: '', restingHrBaseline: '', recentTsb: '' }),
  null,
)
const partial = dailyReadiness({ restingHr: 50, restingHrBaseline: 52 })
check('a single real signal still scores', partial.score, 85)
check('and reports how thin the basis is', partial.inputs, 1)

console.log('\nMetabolic Substrate Utilization (FatMax)')
const subZone2 = substrateOxidation(125, 60, 190) // ~65% max HR (Zone 2)
check('calculates caloric and fat/carb breakdown', subZone2 !== null, true)
check('Zone 2 burns predominantly fat (>50%)', subZone2.fatPercentage >= 60, true)
check('missing HR yields null', substrateOxidation(null, 60, 190), null)



console.log('\nTime in heart-rate zones')
// A track at a steady 130 bpm against a 190 max sits at 68% — Zone 2.
const zoneTrack = []
for (let s = 0; s <= 60; s += 1) zoneTrack.push([36.37, -94.2, 1_700_000_000_000 + s * 1000, null, 130])
const zoneDist = timeInZones(zoneTrack, 190)
check('a steady ride lands in one zone', zoneDist.find((z) => z.percent === 100)?.zone, 2)
check('and the seconds are the ride length', zoneDist[1].seconds, 60)

// Half easy, half hard: the average would read as a moderate ride that never
// happened. The distribution is what tells them apart.
const splitTrack = []
for (let s = 0; s < 60; s += 1) splitTrack.push([36.37, -94.2, 1_700_000_000_000 + s * 1000, null, 110])
for (let s = 60; s <= 120; s += 1) splitTrack.push([36.37, -94.2, 1_700_000_000_000 + s * 1000, null, 180])
const split = timeInZones(splitTrack, 190)
check('a polarized ride shows both ends', [split[0].percent > 0, split[4].percent > 0], [true, true])
check('and nothing in the middle', split[2].percent, 0)

console.log('\nZone time refuses to invent')
check('no heart rate yields null, not five zeroes', timeInZones([[36.37, -94.2, 1, null, null], [36.37, -94.2, 2, null, null]], 190), null)
check('no max HR yields null', timeInZones(zoneTrack, null), null)
check('an empty track yields null', timeInZones([], 190), null)
// A long gap is a coffee stop, not an hour at the last-known heart rate.
const gapped = [
  [36.37, -94.2, 1_700_000_000_000, null, 140],
  [36.37, -94.2, 1_700_000_000_000 + 600_000, null, 140],
  [36.37, -94.2, 1_700_000_000_000 + 601_000, null, 140],
]
check('a ten-minute gap is not counted as riding', timeInZones(gapped, 190)[2].seconds, 1)

console.log('\nCombining zone times across rides')
const combined = combineZoneTimes([timeInZones(zoneTrack, 190), timeInZones(zoneTrack, 190)])
check('two identical rides double the seconds', combined[1].seconds, 120)
check('and the split is unchanged', combined[1].percent, 100)
check('nothing to combine is null', combineZoneTimes([]), null)
check('nulls are ignored, not counted', combineZoneTimes([null, timeInZones(zoneTrack, 190)])[1].seconds, 60)

console.log('\nAcute:Chronic Workload Ratio (ACWR)')
const sweetAcwr = acwr(105, 100)
check('sweet spot ratio is computed', sweetAcwr.ratio, 1.05)
check('sweet spot zone is identified', sweetAcwr.zone, 'sweet-spot')
check('undertraining zone is identified', acwr(60, 100).zone, 'undertraining')
check('caution zone is identified', acwr(140, 100).zone, 'caution')
const dangerAcwr = acwr(165, 100)
check('danger zone is identified', dangerAcwr.zone, 'danger')
check('danger zone triggers alert tone', dangerAcwr.tone, 'bad')
check('missing acute load is null', acwr(null, 100), null)
check('missing chronic load is null', acwr(100, null), null)
check('zero chronic load is null, not Infinity', acwr(100, 0), null)
check('empty strings are null', acwr('', ''), null)

console.log('\nFoster Training Monotony & Strain Index')
const variedWeek = [0, 100, 0, 150, 0, 80, 0] // 3 training days, 4 rest days
const variedStats = fosterMonotonyAndStrain(variedWeek)
check('computes total weekly load', variedStats.totalLoad, 330)
check('varied training has low monotony (<1.0)', variedStats.monotony < 1.0, true)
check('varied training is in optimal zone', variedStats.monotonyZone, 'optimal')
check('computes training strain (load × monotony)', variedStats.strain, Math.round(330 * variedStats.monotony))

const monotonousWeek = [50, 50, 50, 50, 50, 50, 50] // identical daily load
const monoStats = fosterMonotonyAndStrain(monotonousWeek)
check('identical training produces high monotony', monoStats.monotony >= 2.0, true)
check('identical training triggers high alert zone', monoStats.monotonyZone, 'high')

check('all rest days is null, not zero division', fosterMonotonyAndStrain([0, 0, 0, 0, 0, 0, 0]), null)
check('empty array is null', fosterMonotonyAndStrain([]), null)
check('single day is null', fosterMonotonyAndStrain([100]), null)

const mockRideList = [
  { ridden_at: '2026-08-20T12:00:00Z', avg_hr: 150, duration_min: 60 },
  { ridden_at: '2026-08-21T12:00:00Z', avg_hr: 140, duration_min: 45 },
]
const weekMonotonyResult = weeklyMonotony(mockRideList, { endDate: '2026-08-22' })
check('weeklyMonotony helper produces valid output', weekMonotonyResult !== null, true)

console.log('\nPolarized Training 80/20 Distribution Audit')
const polarizedMock = [
  { zone: 1, seconds: 1200 },
  { zone: 2, seconds: 3600 },
  { zone: 3, seconds: 300 },
  { zone: 4, seconds: 600 },
  { zone: 5, seconds: 300 },
]
const polResult = polarizedAudit(polarizedMock)
check('computes Low percentage (80%)', polResult.lowPct, 80)
check('computes Mod percentage (5%)', polResult.modPct, 5)
check('computes High percentage (15%)', polResult.highPct, 15)
check('identifies Polarized archetype', polResult.archetype, 'Polarized')

const pyramidalMock = [
  { zone: 1, seconds: 1200 },
  { zone: 2, seconds: 3000 },
  { zone: 3, seconds: 1200 },
  { zone: 4, seconds: 400 },
  { zone: 5, seconds: 200 },
]
const pyrResult = polarizedAudit(pyramidalMock)
check('identifies Pyramidal archetype', pyrResult.archetype, 'Pyramidal')

const thresholdMock = [
  { zone: 1, seconds: 600 },
  { zone: 2, seconds: 2400 },
  { zone: 3, seconds: 2400 },
  { zone: 4, seconds: 600 },
]
const threshResult = polarizedAudit(thresholdMock)
check('identifies Threshold-Heavy / Grey Zone', threshResult.archetype, 'Threshold-Heavy')
check('triggers warn tone on Grey Zone', threshResult.tone, 'warn')

check('less than 60 seconds of HR is null', polarizedAudit([{ zone: 1, seconds: 30 }]), null)
check('empty zone array is null', polarizedAudit([]), null)
check('null input is null', polarizedAudit(null), null)

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
