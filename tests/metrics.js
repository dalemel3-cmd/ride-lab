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
  analysable,
  speedAtHeartRate,
  aerobicEfficiencyTrend,
  EFFICIENCY_BAND,
  resolveStudyStart,
  studyProgress,
  preTrainingHrv,
  recordingSource,
  CROSS_SOURCE_DISTANCE_BIAS_PCT,
} from '../src/data/metrics.js'
import { buildStudyReport } from '../src/features/progress/buildStudyReport.js'
import {
  startOfWeek,
  endOfWeek,
  formatWeekRange,
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
check('endOfWeek anchors to Sunday', endOfWeek('2026-05-04'), '2026-05-10')
check('formatWeekRange formats single month week', formatWeekRange('2026-05-04'), 'May 4 – May 10')
check('formatWeekRange handles month boundary', formatWeekRange('2026-08-31'), 'Aug 31 – Sep 6')
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

// Three readings is not a baseline. With an SD computed from a handful of
// points the bands close to a hair's width, and the second reading of the
// study gets branded "Sympathetic Stress / Overreached" for sitting a few
// milliseconds off the only other reading — a fact about the sample size,
// printed as a finding about the rider.
check('three readings do not establish a baseline', hrvResult[2].baselineEstablished, false)
check('withholds the verdict until it has one', hrvResult[2].autonomicState, 'Establishing baseline')

const hrvEstablished = hrvAutonomicBands([
  { measured_at: '2026-05-01', hrv_ms: 80 },
  { measured_at: '2026-05-02', hrv_ms: 85 },
  { measured_at: '2026-05-03', hrv_ms: 82 },
  { measured_at: '2026-05-04', hrv_ms: 79 },
  { measured_at: '2026-05-05', hrv_ms: 84 },
  { measured_at: '2026-05-06', hrv_ms: 81 },
  { measured_at: '2026-05-07', hrv_ms: 83 },
])
check('seven readings establish a baseline', hrvEstablished[6].baselineEstablished, true)
check('reports how many readings back it', hrvEstablished[6].samples, 7)
check(
  'gives a real verdict once established',
  hrvEstablished[6].autonomicState !== 'Establishing baseline',
  true,
)

// The suppression is genuine, not cosmetic: a reading far below the band still
// reads as unestablished on day two, because there is not yet a band to be
// below.
const hrvCrash = hrvAutonomicBands([
  { measured_at: '2026-05-01', hrv_ms: 80 },
  { measured_at: '2026-05-02', hrv_ms: 30 },
])
check('a crash on day two is not called overreaching', hrvCrash[1].autonomicState, 'Establishing baseline')

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

// Readiness interpolation smoothing
const tsb149 = dailyReadiness({ hrv: 80, hrvBaseline: 80, recentTsb: -14.9 })
const tsb151 = dailyReadiness({ hrv: 80, hrvBaseline: 80, recentTsb: -15.1 })
check('TSB -14.9 and -15.1 do not step-jump by 10 points', Math.abs(tsb149.score - tsb151.score) <= 1, true)

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

// A plain YYYY-MM-DD is a calendar date, not an instant to be re-zoned. Parsed
// as UTC midnight and converted to America/Chicago it lands on the day before,
// which would silently drop the most recent day of training out of the window.
const namedDayWindow = weeklyMonotony(
  [{ ridden_at: '2026-08-22T18:00:00Z', avg_hr: 150, duration_min: 60 }],
  { endDate: '2026-08-22' },
)
check('a bare date string ends the window on that date', namedDayWindow !== null, true)
check('so a ride on that date is inside the window', namedDayWindow.totalLoad > 0, true)

// The window is a run of calendar days in the program timezone, matching the
// keys the loads were stored under. Stepping it with toISOString() read the UTC
// date instead, so once the clock passed 7pm Central every bucket shifted a day
// forward: the oldest training day fell out and a future day of zero load came
// in. The same seven rides scored 444.2 load / 17.45 monotony in the morning
// and 386.1 / 2.43 that evening.
const sevenEveningRides = Array.from({ length: 7 }, (_, i) => ({
  // 19:00 America/Chicago is 00:00Z the next day, so each of these carries a
  // UTC date one ahead of the day it was actually ridden.
  ridden_at: `2026-08-${String(25 + i).padStart(2, '0')}T00:00:00Z`,
  avg_hr: 130 + i,
  duration_min: 60,
}))
const morningRead = weeklyMonotony(sevenEveningRides, {
  endDate: new Date('2026-08-30T14:00:00Z'), // 09:00 Central
})
const eveningRead = weeklyMonotony(sevenEveningRides, {
  endDate: new Date('2026-08-31T02:00:00Z'), // 21:00 Central — the same Chicago day
})
check(
  'total load is the same morning and evening on one calendar day',
  morningRead.totalLoad,
  eveningRead.totalLoad,
)
check('and so is monotony', morningRead.monotony, eveningRead.monotony)
check(
  'all seven consecutive training days land inside the window',
  morningRead.totalLoad > 400,
  true,
)

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


console.log('\nHolding a ride out of adaptation analysis')
// A ride can be real — its time and load count — while being useless as
// evidence about fitness. Two rides in this study were ridden with a crank arm
// coming loose, and one of them was the first point in the efficiency trend.
const withBroken = [
  { ridden_at: '2026-08-22T14:00:00Z', avg_hr: 115, duration_min: 50, distance_mi: 6, surface: 'road' },
  { ridden_at: '2026-08-27T14:00:00Z', avg_hr: 127, duration_min: 46, distance_mi: 8.79, surface: 'road', excluded: true },
  { ridden_at: '2026-08-30T14:00:00Z', avg_hr: 145, duration_min: 38, distance_mi: 8.33, surface: 'road' },
]
check('analysable drops excluded rides', analysable(withBroken).length, 2)
check('and keeps the rest untouched', analysable(withBroken)[1].distance_mi, 8.33)
check('an absent flag means included', analysable([{ ridden_at: 'x' }]).length, 1)
const effExcl = efficiencyBySurface(withBroken)
check('the efficiency series skips it too', effExcl[0].points.length, 2)
check(
  'so the trend is measured between the two sound rides',
  effExcl[0].points.map((p) => p.date),
  ['2026-08-22', '2026-08-30'],
)
// Volume is a different question: the ride happened and the body paid for it.
check('but total distance still counts every ride', summarize(withBroken).rides, 3)
check('including the excluded one', summarize(withBroken).distanceMi, 23.1)

console.log('\nSpeed at a fixed heart rate')
// Two points 0.1 mi apart, 30 s and 60 s in. Both in band -> one 30 s leg.
const legTrack = [
  [36.0, -94.0, 1_000_000_000_000, 300, 125],
  [36.001447, -94.0, 1_000_000_030_000, 300, 128],
]
const leg = speedAtHeartRate(legTrack, { minHr: 120, maxHr: 135 })
// 0.001447 deg latitude = 0.09993 mi; over 30 s that is ~11.99 mph.
check('computes mph from the trace', Math.abs(leg.mph - 12) < 0.15, true)
check('and reports how much of the ride backed it', leg.minutes, 0.5)

// A leg is only counted when BOTH ends are in the band, so time merely passing
// through the band on the way to a sprint is not counted as time at that effort.
const throughBand = [
  [36.0, -94.0, 1_000_000_000_000, 300, 125],
  [36.001447, -94.0, 1_000_000_030_000, 300, 160],
]
check('a leg leaving the band is not counted', speedAtHeartRate(throughBand), null)

const belowBand = [
  [36.0, -94.0, 1_000_000_000_000, 300, 100],
  [36.001447, -94.0, 1_000_000_030_000, 300, 105],
]
check('nor is a leg below it', speedAtHeartRate(belowBand), null)

// A pause is not time spent at the last-known heart rate.
const withPause = [
  [36.0, -94.0, 1_000_000_000_000, 300, 125],
  [36.001447, -94.0, 1_000_000_600_000, 300, 126],
]
check('a ten-minute gap is a stop, not a slow mile', speedAtHeartRate(withPause), null)

// A GPS jump would otherwise report a bicycle at motorway speed.
const jump = [
  [36.0, -94.0, 1_000_000_000_000, 300, 125],
  [37.0, -94.0, 1_000_000_010_000, 300, 126],
]
check('a GPS jump is discarded', speedAtHeartRate(jump), null)

check('no track is null, not zero', speedAtHeartRate(null), null)
check('a track without heart rate is null', speedAtHeartRate([[36, -94, 1, 300], [36.001, -94, 2, 300]]), null)
check('the default band is zone 2', [EFFICIENCY_BAND.minHr, EFFICIENCY_BAND.maxHr], [120, 135])

console.log('\nAerobic efficiency trend')
// Same heart rate, more speed, three weeks apart: that is adaptation.
const paceTrack = (mph, hr) => {
  const pts = []
  // 20 minutes of 30-second legs.
  for (let i = 0; i <= 40; i += 1) {
    pts.push([36 + (i * mph * 30 / 3600) / 69.055, -94, 1_000_000_000_000 + i * 30_000, 300, hr])
  }
  return pts
}
const trendRides = [
  { ridden_at: '2026-08-01T14:00:00Z', route_name: 'Loop', track: paceTrack(11, 128) },
  { ridden_at: '2026-08-20T14:00:00Z', route_name: 'Loop', track: paceTrack(13, 128) },
]
const aero = aerobicEfficiencyTrend(trendRides)
check('one point per qualifying ride', aero.points.length, 2)
check('the first is about 11 mph', Math.abs(aero.points[0].mph - 11) < 0.2, true)
check('the second about 13', Math.abs(aero.points[1].mph - 13) < 0.2, true)
check('faster at the same heart rate reads as improvement', aero.trend.improved, true)
check('and the band is reported with the series', aero.band, { minHr: 120, maxHr: 135 })

// A ride with only a moment in the band says nothing and is left out entirely,
// rather than plotted at whatever its partial sample happened to be.
const brief = [{ ridden_at: '2026-08-05T14:00:00Z', track: paceTrack(11, 128).slice(0, 3) }]
check('a ride with under five minutes in band is omitted', aerobicEfficiencyTrend(brief).points.length, 0)
check('an excluded ride never reaches the trend', aerobicEfficiencyTrend([
  { ridden_at: '2026-08-01T14:00:00Z', track: paceTrack(11, 128), excluded: true },
]).points.length, 0)

console.log('\nStudy start and progress')
// A configured date always wins: whatever the rider typed in Settings is a
// statement of fact about their study, not a hint.
check('a configured start date is used verbatim', resolveStudyStart('2026-08-23', {
  rides: [{ ridden_at: '2026-07-01T14:00:00Z' }],
}), '2026-08-23')

// Otherwise the baseline measurement is the anchor — that is the definition of
// a study baseline, and it is what every trendDelta compares against.
check('the baseline measurement anchors the study', resolveStudyStart(null, {
  rides: [{ ridden_at: '2026-08-22T14:00:00Z' }],
  bodyComp: [
    { measured_at: '2026-08-30', is_baseline: false },
    { measured_at: '2026-08-23', is_baseline: true },
  ],
}), '2026-08-23')

// No baseline yet: fall back to the earliest ride, not to today. Defaulting to
// today is what put the cockpit a week ahead of the real study.
check('with no baseline the first ride anchors it', resolveStudyStart(null, {
  rides: [
    { ridden_at: '2026-08-28T14:00:00Z' },
    { ridden_at: '2026-08-22T14:00:00Z' },
  ],
}), '2026-08-22')
check('an excluded ride cannot anchor the study', resolveStudyStart(null, {
  rides: [
    { ridden_at: '2026-08-01T14:00:00Z', excluded: true },
    { ridden_at: '2026-08-22T14:00:00Z' },
  ],
}), '2026-08-22')

// Day and week are both 1-based: the first day of a study is day one, and the
// cockpit used to read "Day 0" on the morning it started.
const dayOne = studyProgress('2026-08-23', 16, '2026-08-23')
check('the first day is day one', dayOne.day, 1)
check('and week one', dayOne.week, 1)
check('and zero percent elapsed', dayOne.percent, 0)

// 2026-08-23 to 2026-09-01 is nine days elapsed, so day ten, week two.
const today = studyProgress('2026-08-23', 16, '2026-09-01')
check('nine days elapsed reads as day ten', today.day, 10)
check('which is week two', today.week, 2)
check('and 8% of sixteen weeks', today.percent, 8)
check('the start date comes back with it', today.startDate, '2026-08-23')

// Week seven begins on day 43 and the last day of week 16 is day 112.
check('day 43 is week seven', studyProgress('2026-08-23', 16, '2026-10-04').week, 7)
const past = studyProgress('2026-08-23', 16, '2027-08-23')
check('the week never exceeds the study length', past.week, 16)
check('and the bar never exceeds full', past.percent, 100)

console.log('\nPre-training HRV reference')
// The real series that exposed this. The 8/23 benchmark (16 mi, RPE 7) sits on
// the study's baseline row, and that night's rMSSD is a post-effort suppression
// of 63 against 87 and 93 the two nights before. Comparing later nights against
// 63 reported a 63% gain; against the pre-training mean it is 15%.
const hrvNights = [
  ['2026-08-21', 87], ['2026-08-22', 93], ['2026-08-23', 63],
  ['2026-08-24', 53], ['2026-09-01', 103],
].map(([measured_at, hrv_ms]) => ({ measured_at, hrv_ms }))
const hrvRides = [
  { ridden_at: '2026-08-22T14:01:00Z' },
  { ridden_at: '2026-08-23T14:22:00Z' },
]
const ref = preTrainingHrv(hrvNights, hrvRides)
// Log mean of 87 and 93, not the arithmetic 90.0 — rMSSD is log-normal.
check('the reference is the log mean of the pre-training nights', ref.ms, 89.9)
check('which is below the arithmetic mean', ref.ms < 90, true)
check('both nights are counted', ref.nights, 2)
check('the window is reported', [ref.from, ref.to], ['2026-08-21', '2026-08-22'])
check('two nights is enough to stand as a reference', ref.established, true)
// The night of the first ride counts: its sleep ended that morning, before the
// ride, and the day before it had no ride to carry over.
check('the first ride day is included, not excluded', ref.to, '2026-08-22')
// The whole point — the suppressed baseline night never reaches the reference.
check('the benchmark night is excluded', ref.ms > 63, true)

// A study that only started measuring on ride day has no pre-training window,
// and saying so beats inventing one out of a post-ride night.
check('no nights before the first ride is null', preTrainingHrv(
  [{ measured_at: '2026-08-23', hrv_ms: 63 }],
  [{ ridden_at: '2026-08-22T14:01:00Z' }],
), null)
check('no rides at all is null', preTrainingHrv(hrvNights, []), null)
check('no measurements is null', preTrainingHrv([], hrvRides), null)

// One night is usable but flagged, so the UI can qualify the claim.
const thin = preTrainingHrv(
  [{ measured_at: '2026-08-22', hrv_ms: 93 }],
  [{ ridden_at: '2026-08-22T14:01:00Z' }],
)
check('a single night still gives a reference', thin.ms, 93)
check('but is marked unestablished', thin.established, false)

// An excluded ride must not define where training started — the aborted
// mechanical would otherwise pull the window shut a day early.
check('an excluded ride does not open the training window', preTrainingHrv(
  hrvNights,
  [{ ridden_at: '2026-08-21T14:00:00Z', excluded: true }, { ridden_at: '2026-08-22T14:01:00Z' }],
).nights, 2)

// Nulls and zeroes are absent readings, not low ones.
check('missing readings are skipped', preTrainingHrv(
  [
    { measured_at: '2026-08-20', hrv_ms: null },
    { measured_at: '2026-08-21', hrv_ms: 0 },
    { measured_at: '2026-08-22', hrv_ms: 93 },
  ],
  hrvRides,
).nights, 1)

console.log('\nCross-device route comparison')
check('an imported ride reports its source', recordingSource({ source: 'ridewithgps' }), 'ridewithgps')
check('a hand-logged ride is manual', recordingSource({ source: null }), 'manual')
check('as is one with no source field at all', recordingSource({}), 'manual')

// The real pair. Same start, same turnaround to within 0.01 mi, same bounding
// box — but 8.79 mi by phone and 8.33 mi by Ride with GPS. Both figures below
// are distance-sensitive, so the device change alone moves them.
const sameRoute = [
  { ridden_at: '2026-08-27T23:44:00Z', route_name: 'Grand Blvd to Razorback Greenway', distance_mi: 8.79, duration_min: 46, avg_hr: 127, source: null },
  { ridden_at: '2026-08-30T22:55:00Z', route_name: 'Grand Blvd to Razorback Greenway', distance_mi: 8.33, duration_min: 38, avg_hr: 145, source: 'ridewithgps' },
]
const crossDevice = routeProgress(sameRoute)[0]
check('the mixed devices are flagged', crossDevice.mixedSources, true)
check('and both are named', crossDevice.sources, ['manual', 'ridewithgps'])
check('the noise floor is reported', crossDevice.noiseFloorPct, CROSS_SOURCE_DISTANCE_BIAS_PCT)
// 665 → 661 is 0.6%: nowhere near the 4.3% the devices disagree by, so it is
// not evidence of anything, however much "beats per mile fell" reads like it.
check('a sub-threshold cardiac-cost change is not conclusive', crossDevice.beatsPerMile.conclusive, false)
check('though the direction is still reported', crossDevice.beatsPerMile.improved, true)
// 11.5 → 13.2 mph is 14.8%, comfortably clear of the floor.
check('a change well past the floor stands', crossDevice.speed.conclusive, true)

// Same device throughout: nothing systematic separates the rides, so no floor.
const sameDevice = sameRoute.map((r) => ({ ...r, source: 'ridewithgps' }))
const clean = routeProgress(sameDevice)[0]
check('one device means no mixed-source flag', clean.mixedSources, false)
check('and no noise floor', clean.noiseFloorPct, null)
check('so even a small change is reported as real', clean.beatsPerMile.conclusive, true)

console.log('\nCase study report export generator')
const sampleReport = buildStudyReport({
  currentWeek: 2,
  settings: { caseStudyWeeks: 16 },
  maturity: { days: 12, ctlReady: false, acwrReady: false, monotonyReady: true, ridesWithContinuousHr: 2 },
  totals: { rides: 6, distanceMi: 54.35, durationMin: 230, elevationFt: 2400 },
  substrateTotals: { totalKcal: 2500, fatGrams: 80, fatPounds: '0.18', carbGrams: 300 },
  latestPmc: { ctl: 24, atl: 30, tsb: -6, status: 'Neutral', tone: 'neutral' },
  latestAcwr: { ratio: 1.15, label: 'Optimal', tone: 'good' },
  monotonyStats: { monotony: 1.4, strain: 420 },
  routeGains: [crossDevice],
})
check('report includes title', sampleReport.includes('# 16-Week Cycling Physiological Case Study Report'), true)
check('report flags provisional data maturity at top', sampleReport.includes('12 days of ride history'), true)
check('report marks CTL as provisional with days remaining', sampleReport.includes('**Fitness (CTL - 42d):** 24 *(provisional — 12d of 42d history)*'), true)
check('report marks ACWR as not yet interpretable', sampleReport.includes('*(not yet interpretable — needs 28d of history, has 12d)*'), true)
check('report flags inconclusive cross-device delta', sampleReport.includes('*(within device noise — not conclusive)*'), true)

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
