/**
 * Numerical validation of every calculation the case study reports.
 *
 * tests/metrics.js checks behaviour: nulls where data is missing, sensible
 * branches, no NaN. This file checks *arithmetic*. Every expected value here is
 * derived from the published definition of the metric and worked out
 * independently — either by hand in the comment above it, or by a reference
 * implementation written in this file from the formula rather than imported
 * from the app. A test that calls the app to decide what the app should return
 * proves nothing.
 *
 * Run with: node tests/validation.js
 */

import {
  predictedMaxHr,
  estimateVo2Max,
  beatsPerMile,
  efficiencyFactor,
  avgSpeed,
  haversineMiles,
  trackDistanceMiles,
  vam,
  gradePercent,
  trimp,
  performanceManagementChart,
  hrvAutonomicBands,
  fosterMonotonyAndStrain,
  substrateOxidation,
  timeInZones,
  combineZoneTimes,
  polarizedAudit,
  dailyReadiness,
  trainingLoad,
  hrZone,
} from '../src/data/metrics.js'
import { elevationGainMeters } from '../src/data/track.js'

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

function close(name, actual, expected, tolerance) {
  const ok = actual != null && Math.abs(actual - expected) <= tolerance
  if (ok) {
    console.log(`  ok   ${name} → ${actual} (±${tolerance} of ${expected})`)
    passed += 1
  } else {
    console.error(`  FAIL ${name}`)
    console.error(`       expected: ${expected} ±${tolerance}`)
    console.error(`       actual:   ${actual}`)
    failed += 1
  }
}

// ---------------------------------------------------------------------------
// Reference implementations, written from the formulas rather than imported.
// ---------------------------------------------------------------------------

/** Banister TRIMP. HRr = (HR − rest)/(max − rest); y = 0.64·e^(1.92·HRr) male. */
function refTrimp(hr, minutes, max, rest, male = true) {
  const r = (hr - rest) / (max - rest)
  const y = male ? 0.64 * Math.exp(1.92 * r) : 0.86 * Math.exp(1.67 * r)
  return minutes * r * y
}

/** Exponentially weighted moving average, λ = 2/(N+1). */
function refEwma(loads, n) {
  const lambda = 2 / (n + 1)
  let v = 0
  const out = []
  for (const load of loads) {
    v = v * (1 - lambda) + load * lambda
    out.push(v)
  }
  return out
}

/** Foster: monotony = mean/SD of daily load; strain = weekly total × monotony. */
function refFoster(daily) {
  const n = daily.length
  const total = daily.reduce((s, v) => s + v, 0)
  const mean = total / n
  const sd = Math.sqrt(daily.reduce((s, v) => s + (v - mean) ** 2, 0) / n)
  const monotony = sd === 0 ? 10 : mean / sd
  return { total, mean, sd, monotony, strain: total * monotony }
}

/** Plews: ln(rMSSD), rolling mean, bands at ± 0.5 SD. */
function refHrvBand(values) {
  const ln = values.map(Math.log)
  const mean = ln.reduce((s, v) => s + v, 0) / ln.length
  const sd = Math.sqrt(ln.reduce((s, v) => s + (v - mean) ** 2, 0) / ln.length)
  const swc = 0.5 * (sd || 0.1)
  return { baseline: Math.exp(mean), lower: Math.exp(mean - swc), upper: Math.exp(mean + swc) }
}

const isoDaysAgo = (n) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------

console.log('\nAge-predicted max HR — Tanaka: 208 − 0.7 × age')
// 208 − 0.7×30 = 208 − 21 = 187.   208 − 0.7×44 = 208 − 30.8 = 177.2 → 177.
check('age 30', predictedMaxHr(30), 187)
check('age 44 rounds 177.2 to 177', predictedMaxHr(44), 177)
check('age 65 → 208 − 45.5 = 162.5 → 163', predictedMaxHr(65), 163)

console.log('\nVO₂ max — Uth–Sørensen: 15.3 × (HRmax / HRrest)')
// 15.3 × 190/60 = 15.3 × 3.16667 = 48.45
close('max 190, rest 60 = 48.45', estimateVo2Max(60, 190), 48.45, 0.05)
// 15.3 × 177/54 = 15.3 × 3.27778 = 50.150, which lands exactly on the rounding
// boundary and is reported to one decimal as 50.2. Tolerance has to allow half
// a display digit, or the test fails the code for rounding correctly.
close('max 177, rest 54 = 50.15 → 50.2', estimateVo2Max(54, 177), 50.15, 0.06)
// Halving resting HR must exactly double the estimate — it is a pure ratio.
close(
  'the estimate is linear in 1/restingHr',
  estimateVo2Max(30, 190),
  estimateVo2Max(60, 190) * 2,
  0.1,
)

console.log('\nCardiac cost — beats per mile: HR × minutes ÷ miles')
// 150 × 60 = 9,000 beats over 15 mi = 600.
check('150 bpm, 60 min, 15 mi', beatsPerMile(150, 60, 15), 600)
// 142 × 97 = 13,774 beats over 15.96 mi = 863.03 → 863.
check('142 bpm, 97 min, 15.96 mi', beatsPerMile(142, 97, 15.96), 863)
// Covering twice the distance for the same beats must halve the cost exactly.
check(
  'doubling distance halves the cost',
  beatsPerMile(150, 60, 30),
  Math.round(beatsPerMile(150, 60, 15) / 2),
)
// And riding twice as long at the same HR and speed must not change it at all.
check(
  'cost is independent of ride length at constant speed and HR',
  beatsPerMile(150, 120, 30),
  beatsPerMile(150, 60, 15),
)

console.log('\nSpeed and efficiency factor')
close('20 mi in 1h 20m = 15 mph', avgSpeed(20, 80), 15, 0.001)
// EF = speed ÷ HR = 15 / 150 = 0.1
close('EF = 15 mph / 150 bpm = 0.100', efficiencyFactor(20, 80, 150), 0.1, 0.0005)

console.log('\nHaversine distance')
// One degree of latitude is 1/360 of the meridian: 2π × 3958.8 / 360 = 69.097 mi.
close('1° of latitude', haversineMiles([36, -94], [37, -94]), 69.097, 0.05)
// One degree of longitude shrinks by cos(latitude): 69.097 × cos(36°) = 55.90 mi.
close('1° of longitude at 36°N', haversineMiles([36, -94], [36, -93]), 55.9, 0.1)
// Bentonville to Fayetteville, ~26 mi apart.
close(
  'Bentonville → Fayetteville ≈ 26 mi',
  haversineMiles([36.3729, -94.2088], [36.0626, -94.1574]),
  21.5,
  1.5,
)
check('a track sums its legs, not its endpoints', Math.round(
  trackDistanceMiles([
    [36.0, -94.0, 0],
    [36.1, -94.0, 0],
    [36.0, -94.0, 0],
  ]) * 100,
) / 100, Math.round(haversineMiles([36.0, -94.0], [36.1, -94.0]) * 2 * 100) / 100)

console.log('\nVAM and gradient')
// 300 m climbed in 30 min = 600 m/h.
check('300 m in 30 min = 600 m/h', vam(300, 30), 600)
// 5 mi = 8046.72 m; 300/8046.72 = 3.728% → 3.7.
check('300 m over 5 mi = 3.7%', gradePercent(300, 5), 3.7)
// Tomorrow's route: 207 ft = 63.09 m over 15.96 mi = 25,685 m → 0.2%.
check('63 m over 15.96 mi = 0.2%', gradePercent(63.09, 15.96), 0.2)

console.log('\nTRIMP — Banister exponential')
// HRr = (150−60)/(190−60) = 0.692308
// y   = 0.64 × e^(1.92 × 0.692308) = 0.64 × e^1.329231 = 0.64 × 3.778 = 2.4179
// TRIMP = 60 × 0.692308 × 2.4179 = 100.44
close('150 bpm, 60 min, max 190, rest 60', trimp(150, 60, 190, 60), 100.44, 0.05)
close('130 bpm, 60 min, max 190, rest 60', trimp(130, 60, 190, 60), 58.14, 0.05)
close('170 bpm, 30 min, max 190, rest 60', trimp(170, 30, 190, 60), 82.47, 0.05)
// Women's coefficients differ: 0.86 × e^(1.67 × HRr).
close('female coefficients', trimp(150, 60, 190, 60, 'female'), 113.52, 0.05)
// Against the reference implementation across a grid, not just at chosen points.
let trimpWorst = 0
for (const hr of [110, 125, 140, 155, 170, 185]) {
  for (const mins of [20, 45, 90, 180]) {
    for (const rest of [48, 54, 60, 66]) {
      const got = trimp(hr, mins, 190, rest)
      const want = refTrimp(hr, mins, 190, rest)
      trimpWorst = Math.max(trimpWorst, Math.abs(got - want))
    }
  }
}
close('matches the reference across 96 combinations', trimpWorst, 0, 0.05)
// Resting heart rate is not a cosmetic input: at rest 54 rather than 60 the
// same ride carries ~5% more load, because heart-rate reserve is wider.
close('rest 54 vs rest 60 on the same ride', trimp(150, 60, 190, 54) / trimp(150, 60, 190, 60), 1.05, 0.02)

console.log('\nPerformance Management Chart — EWMA, λ = 2/(N+1)')
// A deterministic 30-day history: one 60-minute ride at 150 bpm every third
// day, ending today. Load per riding day is TRIMP(150, 60, 190, 60) = 100.44.
//
// The window starts on the first riding day, not an arbitrary 30 days back:
// the series is built from the first ride forward, so the reference array has
// to begin there too or the row counts disagree by the empty days in front.
const FIRST_RIDE_DAYS_AGO = 27
const pmcRides = []
const dailyLoads = []
for (let daysAgo = FIRST_RIDE_DAYS_AGO; daysAgo >= 0; daysAgo -= 1) {
  const riding = daysAgo % 3 === 0
  if (riding) {
    pmcRides.push({
      ridden_at: `${isoDaysAgo(daysAgo)}T12:00:00Z`,
      avg_hr: 150,
      duration_min: 60,
    })
  }
  dailyLoads.push(riding ? refTrimp(150, 60, 190, 60) : 0)
}

const pmc = performanceManagementChart(pmcRides, { defaultMaxHr: 190, restingHr: 60 })
const today = pmc[pmc.length - 1]
const refCtl = refEwma(dailyLoads, 42)
const refAtl = refEwma(dailyLoads, 7)
const refChronic = refEwma(dailyLoads, 28)

check('produces one row per day', pmc.length, dailyLoads.length)
close('CTL matches a 42-day EWMA', today.ctl, refCtl[refCtl.length - 1], 0.15)
close('ATL matches a 7-day EWMA', today.atl, refAtl[refAtl.length - 1], 0.15)
check('TSB is exactly CTL − ATL', today.tsb, Math.round((today.ctl - today.atl) * 10) / 10)

// The bug this suite was written to catch. ACWR is a 7:28 comparison. Dividing
// by the 42-day CTL uses a denominator that fills more slowly, which inflates
// the ratio for six weeks — and reported 5.15 "Danger Zone" in week one off two
// easy rides.
close('ACWR chronic side is a 28-day EWMA', today.acwrChronic, refChronic[refChronic.length - 1], 0.15)
close(
  'ACWR = ATL ÷ 28-day chronic',
  today.acwr,
  refAtl[refAtl.length - 1] / refChronic[refChronic.length - 1],
  0.02,
)
check(
  'and is NOT ATL ÷ CTL(42)',
  Math.abs(today.acwr - today.atl / today.ctl) > 0.02,
  true,
)

// Steady state is the cleanest invariant in the whole model: ride the identical
// load every day for long enough and every window converges on it, so acute
// equals chronic and the ratio is exactly 1.0. Any window mismatch breaks this.
const steadyRides = []
for (let daysAgo = 200; daysAgo >= 0; daysAgo -= 1) {
  steadyRides.push({
    ridden_at: `${isoDaysAgo(daysAgo)}T12:00:00Z`,
    avg_hr: 140,
    duration_min: 60,
  })
}
const steady = performanceManagementChart(steadyRides, { defaultMaxHr: 190, restingHr: 60 })
const steadyToday = steady[steady.length - 1]
close('steady training drives ACWR to 1.0', steadyToday.acwr, 1.0, 0.02)
close('and TSB to 0', steadyToday.tsb, 0, 1.0)
close(
  'CTL converges on the daily load itself',
  steadyToday.ctl,
  refTrimp(140, 60, 190, 60),
  1.0,
)

console.log('\nFoster monotony and strain')
// [0,0,0,0,240,0,290]: total 530, mean 75.714, population SD 120.458,
// monotony 0.6286, strain 530 × 0.6286 = 333.1 → 333.
const fosterCase = [0, 0, 0, 0, 240, 0, 290]
const fosterRef = refFoster(fosterCase)
const fosterGot = fosterMonotonyAndStrain(fosterCase)
close('monotony = mean ÷ SD', fosterGot.monotony, fosterRef.monotony, 0.01)
close('strain = weekly load × monotony', fosterGot.strain, fosterRef.strain, 1)
check('total weekly load', fosterGot.totalLoad, 530)
// Identical load every day is the pathological case Foster warns about: no
// variation at all, so SD is zero and the ratio is undefined. Clamped, not NaN.
check('identical daily load clamps instead of dividing by zero', fosterMonotonyAndStrain([100, 100, 100, 100, 100, 100, 100]).monotony, 10)
// More variation must always mean lower monotony.
check(
  'more day-to-day variation lowers monotony',
  fosterMonotonyAndStrain([50, 200, 0, 150, 0, 300, 0]).monotony <
    fosterMonotonyAndStrain([100, 110, 90, 105, 95, 100, 100]).monotony,
  true,
)

console.log('\nHRV bands — Plews ln(rMSSD) ± 0.5 SD')
// The rider's real seven days to 23 Aug 2026: 98, 99, 124, 104, 92, 91, 81.
// ln mean 4.5817 → baseline 97.68; SD 0.12217, SWC 0.06109;
// lower 91.89, upper 103.84. Today's 81 sits below the lower band.
const hrvWindow = [98, 99, 124, 104, 92, 91, 81]
const hrvRef = refHrvBand(hrvWindow)
const hrvBands = hrvAutonomicBands(
  hrvWindow.map((hrv, i) => ({ measured_at: `2026-08-${String(17 + i).padStart(2, '0')}`, hrv_ms: hrv })),
)
const hrvToday = hrvBands[hrvBands.length - 1]
close('rolling baseline is the geometric mean', hrvToday.baselineHrv, hrvRef.baseline, 0.1)
close('lower band = exp(ln mean − 0.5 SD)', hrvToday.lowerBand, hrvRef.lower, 0.1)
close('upper band = exp(ln mean + 0.5 SD)', hrvToday.upperBand, hrvRef.upper, 0.1)
check('81 ms against a baseline of 97.7 reads as suppressed', hrvToday.autonomicState, 'Sympathetic Stress / Overreached')
check('and the verdict is backed by seven readings', hrvToday.baselineEstablished, true)
// The bands must bracket the baseline, always.
check('bands bracket the baseline', hrvToday.lowerBand < hrvToday.baselineHrv && hrvToday.upperBand > hrvToday.baselineHrv, true)

console.log('\nSubstrate oxidation')
// 150 bpm of 190 = 78.9% intensity → kcal/min = 5 + 10×0.789 = 12.89
// over 60 min = 773 kcal. Below 80% the split is 40% fat:
// fat 309.5 kcal ÷ 9 = 34.4 g; carb 464.2 ÷ 4 = 116 g.
const sub = substrateOxidation(150, 60, 190)
close('total kcal', sub.totalKcal, 773.7, 1)
close('fat grams at 9 kcal/g', sub.fatGrams, 34.4, 1)
close('carb grams at 4 kcal/g', sub.carbGrams, 116, 1)
check('the split is stated as percentages that sum to 100', sub.fatPercentage + sub.carbPercentage, 100)
// The energy has to balance: fat grams × 9 + carb grams × 4 ≈ total kcal.
close('energy balances back to the total', sub.fatGrams * 9 + sub.carbGrams * 4, sub.totalKcal, 6)
// Fat fraction must fall as intensity rises — that is the crossover concept.
check(
  'fat fraction falls monotonically with intensity',
  [110, 130, 150, 170, 180]
    .map((hr) => substrateOxidation(hr, 60, 190).fatPercentage)
    .every((v, i, arr) => i === 0 || v <= arr[i - 1]),
  true,
)

console.log('\nZone boundaries and time in zones')
// Zone edges are fractions of max HR: z2 is 60–70% of 190 = 114–133.
check('113 bpm (59.5%) is zone 1', hrZone(113, 190).zone, 1)
check('114 bpm (60.0%) is zone 2', hrZone(114, 190).zone, 2)
check('132 bpm (69.5%) is zone 2', hrZone(132, 190).zone, 2)
check('134 bpm (70.5%) is zone 3', hrZone(134, 190).zone, 3)

// A track of 10-second samples: 6 samples at 120 bpm (zone 2) then 6 at 165
// (zone 4). Each gap is attributed to the heart rate at its start, so the last
// point contributes nothing — 5 gaps × 10 s = 50 s in zone 2, then one 10 s
// gap at 120 bridging into the zone-4 block, then 5 × 10 s at 165.
const base = Date.UTC(2026, 7, 23, 12, 0, 0)
const track = []
for (let i = 0; i < 6; i += 1) track.push([36, -94, base + i * 10000, 300, 120])
for (let i = 6; i < 12; i += 1) track.push([36, -94, base + i * 10000, 300, 165])
const zones = timeInZones(track, 190)
check('zone 2 seconds', zones.find((z) => z.zone === 2).seconds, 60)
check('zone 4 seconds', zones.find((z) => z.zone === 4).seconds, 50)
check('nothing lands in the zones never ridden', zones.filter((z) => z.seconds > 0).length, 2)
check('percentages sum to 100', zones.reduce((s, z) => s + z.percent, 0), 100)

// A gap longer than a minute is a stop, not time at the last-known heart rate.
const withStop = [
  [36, -94, base, 300, 120],
  [36, -94, base + 10000, 300, 120],
  [36, -94, base + 3610000, 300, 120], // an hour later
  [36, -94, base + 3620000, 300, 120],
]
check('an hour-long stop is not counted as an hour in zone 2', timeInZones(withStop, 190).find((z) => z.zone === 2).seconds, 20)

console.log('\nCombining and auditing distributions')
const combined = combineZoneTimes([timeInZones(track, 190), timeInZones(track, 190)])
check('combining two identical rides doubles the seconds', combined.find((z) => z.zone === 2).seconds, 120)
check('but leaves the proportions unchanged', combined.find((z) => z.zone === 2).percent, zones.find((z) => z.zone === 2).percent)

// Seiler domains: low = Z1+Z2, moderate = Z3, high = Z4+Z5.
const audit = polarizedAudit([
  { zone: 1, seconds: 3000 },
  { zone: 2, seconds: 5000 },
  { zone: 3, seconds: 500 },
  { zone: 4, seconds: 1000 },
  { zone: 5, seconds: 500 },
])
// 8000 low, 500 mod, 1500 high of 10,000 → 80 / 5 / 15.
check('low domain is Z1+Z2', audit.lowPct, 80)
check('moderate domain is Z3 alone', audit.modPct, 5)
check('high domain is Z4+Z5', audit.highPct, 15)
check('the three domains account for everything', audit.lowPct + audit.modPct + audit.highPct, 100)

console.log('\nElevation gain')
// A clean 100 m climb sampled every metre, then a 40 m descent. Only the rise
// counts, and it must count once — not once per sample.
const climb = []
for (let m = 0; m <= 100; m += 1) climb.push([36, -94, base + m * 1000, 300 + m, null])
for (let m = 99; m >= 60; m -= 1) climb.push([36, -94, base + (200 - m) * 1000, 300 + m, null])
close('a 100 m climb reports 100 m, not 100 × 1 m of steps', elevationGainMeters(climb), 100, 3)
// Pure noise around a flat elevation must not accumulate into a climb.
const flat = []
for (let i = 0; i < 200; i += 1) {
  flat.push([36, -94, base + i * 1000, 300 + Math.sin(i) * 0.4, null])
}
close('GPS jitter on flat ground is not a climb', elevationGainMeters(flat), 0, 2)

console.log('\nSession RPE and readiness bounds')
// Foster session RPE is the plain product: RPE × minutes.
check('RPE 7 for 95 minutes = 665', trainingLoad(7, 95), 665)
// Readiness is a composite index, so what matters is that it stays in range and
// moves the right way. A perfect day must outscore a wrecked one.
const good = dailyReadiness({ hrv: 105, hrvBaseline: 95, restingHr: 52, restingHrBaseline: 56, recentTsb: 8 })
const bad = dailyReadiness({ hrv: 60, hrvBaseline: 95, restingHr: 63, restingHrBaseline: 56, recentTsb: -35 })
check('a recovered day scores above a wrecked one', good.score > bad.score, true)
check('the score never leaves 10–100', good.score <= 100 && bad.score >= 10, true)
check('and it reports how many signals it had', good.inputs, 3)

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
