/**
 * Derived metrics for the case study.
 *
 * Everything here is a pure function of its arguments — no dates, no storage, no
 * React. That makes the physiology testable against known values (see
 * tests/metrics.js), which matters because these numbers are the actual claims
 * the case study makes.
 */

import { startOfWeek, toDateString, recordDate } from './dates.js'

/**
 * Coerce a value to a number, treating "absent" as absent.
 *
 * `Number(null)` and `Number('')` are both 0, which is finite — so a plain
 * `Number.isFinite` guard silently turns a missing measurement into a real zero
 * and reports a ride with no recorded distance as 0 mph. Every numeric input in
 * this module goes through here instead.
 */
function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Miles per hour. Null when either input is missing or the ride has no time. */
export function avgSpeed(distanceMi, durationMin) {
  const d = toNumber(distanceMi)
  const t = toNumber(durationMin)
  if (d === null || t === null || t <= 0) return null
  return (d / t) * 60
}

/**
 * Age-predicted max heart rate — Tanaka (2001): 208 − 0.7 × age.
 *
 * Preferred over the familiar "220 − age", which systematically overestimates
 * for older adults and underestimates for the young. Only a fallback: a real
 * tested max from a hard effort beats any formula, which is why `maxHr` is a
 * setting the rider can override.
 */
export function predictedMaxHr(age) {
  const a = toNumber(age)
  if (a === null || a <= 0) return null
  return Math.round(208 - 0.7 * a)
}

/**
 * The five classic training zones as percentages of max HR.
 *
 * Boundaries follow the common 5-zone model. The descriptions are what makes
 * the app teach rather than just record — a number without meaning changes
 * nothing about how someone trains.
 */
export const HR_ZONES = [
  {
    zone: 1,
    label: 'Recovery',
    min: 0.5,
    max: 0.6,
    color: 'var(--zone-1)',
    effect: 'Active recovery. Promotes blood flow without adding fatigue.',
  },
  {
    zone: 2,
    label: 'Endurance',
    min: 0.6,
    max: 0.7,
    color: 'var(--zone-2)',
    effect:
      'The aerobic base zone. Builds capillary density and mitochondria, and trains the body to burn fat for fuel. Most of your hours should live here.',
  },
  {
    zone: 3,
    label: 'Tempo',
    min: 0.7,
    max: 0.8,
    color: 'var(--zone-3)',
    effect: 'Moderately hard, sustainable. Improves aerobic efficiency and muscular endurance.',
  },
  {
    zone: 4,
    label: 'Threshold',
    min: 0.8,
    max: 0.9,
    color: 'var(--zone-4)',
    effect:
      'At or near lactate threshold. Raises the intensity you can hold before lactate accumulates faster than you clear it.',
  },
  {
    zone: 5,
    label: 'VO2 Max',
    min: 0.9,
    max: 1.01,
    color: 'var(--zone-5)',
    effect: 'Maximal aerobic effort. Drives peak oxygen uptake. Short intervals only.',
  },
]

/** Which zone a heart rate falls in, given a max. Null if either is unusable. */
export function hrZone(hr, maxHr) {
  const h = toNumber(hr)
  const max = toNumber(maxHr)
  if (h === null || max === null || max <= 0 || h <= 0) return null
  const pct = h / max
  // Below zone 1 is still, functionally, zone 1 for our purposes.
  if (pct < HR_ZONES[0].min) return HR_ZONES[0]
  return HR_ZONES.find((z) => pct >= z.min && pct < z.max) ?? HR_ZONES[HR_ZONES.length - 1]
}

/** Absolute BPM boundaries for each zone, for rendering a zone chart. */
export function hrZoneRanges(maxHr) {
  const max = toNumber(maxHr)
  if (max === null || max <= 0) return []
  return HR_ZONES.map((z) => ({
    ...z,
    lowBpm: Math.round(z.min * max),
    highBpm: Math.round(Math.min(z.max, 1) * max),
  }))
}

/**
 * Session RPE training load: RPE × duration in minutes (Foster, 1998).
 *
 * A 60-minute ride at RPE 5 = 300. It deliberately values duration and
 * intensity together, so an easy long ride and a short hard one can carry
 * comparable load — which is the whole point of tracking it.
 */
export function trainingLoad(rpe, durationMin) {
  const r = toNumber(rpe)
  const t = toNumber(durationMin)
  if (r === null || t === null || r <= 0 || t <= 0) return null
  return Math.round(r * t)
}

/**
 * VO2 max estimate from resting HR — Uth–Sørensen (2004): 15.3 × (maxHR / restHR).
 *
 * Rough, but it moves in the right direction as fitness improves and needs no
 * lab. Treat it as a trend line, not a measurement.
 */
export function estimateVo2Max(restingHr, maxHr) {
  const rest = toNumber(restingHr)
  const max = toNumber(maxHr)
  if (rest === null || max === null || rest <= 0 || max <= 0) return null
  return Math.round(15.3 * (max / rest) * 10) / 10
}

/** Great-circle distance between two [lat, lng] points, in miles. */
export function haversineMiles(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0
  const EARTH_RADIUS_MI = 3958.8
  const toRad = (deg) => (deg * Math.PI) / 180

  const [lat1, lon1] = a
  const [lat2, lon2] = b
  if (![lat1, lon1, lat2, lon2].every((n) => Number.isFinite(Number(n)))) return 0

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Total distance along a GPS track of [lat, lng, t] points, in miles. */
export function trackDistanceMiles(track) {
  if (!Array.isArray(track) || track.length < 2) return 0
  let total = 0
  for (let i = 1; i < track.length; i += 1) {
    total += haversineMiles(track[i - 1], track[i])
  }
  return total
}

/**
 * Group rides into Monday-anchored weeks.
 *
 * Returns oldest-first so it can be charted directly.
 */
export function weeklyRollup(rides = []) {
  const weeks = new Map()

  for (const ride of rides) {
    if (!ride?.ridden_at) continue
    const week = startOfWeek(toDateString(new Date(ride.ridden_at)))
    if (!weeks.has(week)) {
      weeks.set(week, { week, rides: 0, distanceMi: 0, durationMin: 0, elevationFt: 0, load: 0 })
    }
    const bucket = weeks.get(week)
    bucket.rides += 1
    bucket.distanceMi += Number(ride.distance_mi) || 0
    bucket.durationMin += Number(ride.duration_min) || 0
    bucket.elevationFt += Number(ride.elevation_ft) || 0
    bucket.load += trainingLoad(ride.rpe, ride.duration_min) || 0
  }

  return [...weeks.values()]
    .map((w) => ({ ...w, distanceMi: Math.round(w.distanceMi * 10) / 10 }))
    .sort((a, b) => a.week.localeCompare(b.week))
}

/**
 * Change between the first and last value of a series.
 *
 * `direction` says whether a decrease is an improvement (true for weight,
 * resting HR, body fat) so the UI can colour it without re-deciding per metric.
 */
export function trendDelta(values = [], { lowerIsBetter = false } = {}) {
  const nums = values.map(Number).filter((n) => Number.isFinite(n))
  if (nums.length < 2) return null

  const first = nums[0]
  const last = nums[nums.length - 1]
  const change = last - first
  const pctChange = first === 0 ? null : (change / first) * 100

  return {
    first,
    last,
    change: Math.round(change * 10) / 10,
    pctChange: pctChange === null ? null : Math.round(pctChange * 10) / 10,
    improved: lowerIsBetter ? change < 0 : change > 0,
  }
}

/**
 * Aerobic decoupling proxy: heart beats spent per mile travelled.
 *
 * This is the headline of the whole study. As aerobic fitness improves, the
 * same distance costs fewer beats — so a falling line here is the clearest
 * evidence that the training is working, and it is robust to rides of
 * different lengths in a way that raw average HR is not.
 */
export function beatsPerMile(avgHrValue, durationMin, distanceMi) {
  const hr = toNumber(avgHrValue)
  const t = toNumber(durationMin)
  const d = toNumber(distanceMi)
  if (hr === null || t === null || d === null || hr <= 0 || t <= 0 || d <= 0) return null
  return Math.round((hr * t) / d)
}

/** Efficiency factor: speed per unit of heart rate. Rising = getting fitter. */
export function efficiencyFactor(distanceMi, durationMin, avgHrValue) {
  const speed = avgSpeed(distanceMi, durationMin)
  const hr = toNumber(avgHrValue)
  if (speed === null || hr === null || hr <= 0) return null
  return Math.round((speed / hr) * 1000) / 1000
}

/**
 * Beats-per-mile grouped by surface.
 *
 * Terrain dominates this metric — singletrack costs far more heartbeats per
 * mile than pavement at any fitness level. Comparing a gravel ride to a road
 * ride measures the trail, not the rider, so the series is split by surface
 * and only ever compared within a group.
 */
export function efficiencyBySurface(rides = []) {
  const groups = new Map()

  for (const ride of [...rides].sort((a, b) => String(a.ridden_at).localeCompare(String(b.ridden_at)))) {
    const bpm = beatsPerMile(ride.avg_hr, ride.duration_min, ride.distance_mi)
    if (bpm === null) continue
    const surface = ride.surface || 'unspecified'
    if (!groups.has(surface)) groups.set(surface, [])
    groups.get(surface).push({
      date: recordDate(ride),
      beatsPerMile: bpm,
      route: ride.route_name || 'Ride',
    })
  }

  return [...groups.entries()]
    .map(([surface, points]) => ({
      surface,
      points,
      trend: trendDelta(
        points.map((p) => p.beatsPerMile),
        { lowerIsBetter: true },
      ),
    }))
    // Most-ridden surface first: that is the one with a trend worth trusting.
    .sort((a, b) => b.points.length - a.points.length)
}

/**
 * First vs. most recent ride on each repeated route.
 *
 * The cleanest progress signal available without a lab. Same trail, same
 * climbs, same distance — so a change in time or heart rate is a change in the
 * rider rather than in the terrain.
 */
export function routeProgress(rides = []) {
  const byRoute = new Map()

  for (const ride of rides) {
    if (!ride.route_name) continue
    const key = ride.route_name.toLowerCase()
    if (!byRoute.has(key)) byRoute.set(key, [])
    byRoute.get(key).push(ride)
  }

  const results = []

  for (const group of byRoute.values()) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => String(a.ridden_at).localeCompare(String(b.ridden_at)))
    const first = sorted[0]
    const latest = sorted[sorted.length - 1]

    const firstBpm = beatsPerMile(first.avg_hr, first.duration_min, first.distance_mi)
    const latestBpm = beatsPerMile(latest.avg_hr, latest.duration_min, latest.distance_mi)
    const firstSpeed = avgSpeed(first.distance_mi, first.duration_min)
    const latestSpeed = avgSpeed(latest.distance_mi, latest.duration_min)

    results.push({
      route: latest.route_name,
      rides: group.length,
      firstDate: recordDate(first),
      latestDate: recordDate(latest),
      beatsPerMile:
        firstBpm !== null && latestBpm !== null
          ? { first: firstBpm, latest: latestBpm, change: latestBpm - firstBpm, improved: latestBpm < firstBpm }
          : null,
      speed:
        firstSpeed !== null && latestSpeed !== null
          ? {
              first: Math.round(firstSpeed * 10) / 10,
              latest: Math.round(latestSpeed * 10) / 10,
              change: Math.round((latestSpeed - firstSpeed) * 10) / 10,
              improved: latestSpeed > firstSpeed,
            }
          : null,
    })
  }

  return results.sort((a, b) => b.rides - a.rides)
}

/** Headline totals for the whole study to date. */
export function summarize(rides = []) {
  const totals = rides.reduce(
    (acc, r) => {
      acc.rides += 1
      acc.distanceMi += Number(r.distance_mi) || 0
      acc.durationMin += Number(r.duration_min) || 0
      acc.elevationFt += Number(r.elevation_ft) || 0
      acc.load += trainingLoad(r.rpe, r.duration_min) || 0
      return acc
    },
    { rides: 0, distanceMi: 0, durationMin: 0, elevationFt: 0, load: 0 },
  )

  return {
    ...totals,
    distanceMi: Math.round(totals.distanceMi * 10) / 10,
    avgSpeed: avgSpeed(totals.distanceMi, totals.durationMin),
  }
}

/**
 * Banister Training Impulse (TRIMP) - Exponential cardiac stress model (Banister, 1991).
 *
 * TRIMP = durationMin × HR_ratio × 0.64 × e^(1.92 × HR_ratio) (male)
 * HR_ratio = (avgHr - restingHr) / (maxHr - restingHr)
 *
 * Accounts for the exponential physiological cost of high-intensity efforts
 * rather than linear duration-intensity products.
 */
export function trimp(avgHrValue, durationMin, maxHrValue, restingHrValue = 60, gender = 'male') {
  const hr = toNumber(avgHrValue)
  const t = toNumber(durationMin)
  const max = toNumber(maxHrValue)
  const rest = toNumber(restingHrValue) ?? 60

  if (hr === null || t === null || max === null || max <= rest || hr <= rest || t <= 0) {
    return null
  }

  const hrRatio = Math.max(0, Math.min(1, (hr - rest) / (max - rest)))
  const yFactor = gender === 'female' ? 0.86 * Math.exp(1.67 * hrRatio) : 0.64 * Math.exp(1.92 * hrRatio)

  return Math.round(t * hrRatio * yFactor * 10) / 10
}

/**
 * Performance Management Chart (PMC) Engine.
 *
 * Computes daily Chronic Training Load (CTL / Fitness, 42-day decay),
 * Acute Training Load (ATL / Fatigue, 7-day decay), and
 * Training Stress Balance (TSB / Form = CTL - ATL).
 */
export function performanceManagementChart(rides = [], { ctlDays = 42, atlDays = 7, defaultMaxHr = 190 } = {}) {
  if (!Array.isArray(rides) || rides.length === 0) return []

  // Map total load per calendar date (using either TRIMP or Foster load)
  const dailyLoads = new Map()

  for (const ride of rides) {
    const d = recordDate(ride)
    // Prefer TRIMP if HR exists, otherwise fallback to Foster sRPE (scaled ~ / 3 to match TRIMP units)
    let load = null
    if (ride.avg_hr && ride.duration_min) {
      load = trimp(ride.avg_hr, ride.duration_min, defaultMaxHr)
    }
    if (load === null && ride.rpe && ride.duration_min) {
      load = Math.round((trainingLoad(ride.rpe, ride.duration_min) / 3) * 10) / 10
    }
    if (load !== null) {
      dailyLoads.set(d, (dailyLoads.get(d) ?? 0) + load)
    }
  }

  // Sort dates
  const dates = [...dailyLoads.keys()].sort()
  if (dates.length === 0) return []

  const startDate = new Date(`${dates[0]}T12:00:00Z`)
  const endDate = new Date()
  const ctlDecay = 2 / (ctlDays + 1)
  const atlDecay = 2 / (atlDays + 1)

  let ctl = 0
  let atl = 0
  const series = []

  const cur = new Date(startDate)
  while (cur <= endDate) {
    const dateStr = cur.toISOString().slice(0, 10)
    const load = dailyLoads.get(dateStr) ?? 0

    ctl = ctl * (1 - ctlDecay) + load * ctlDecay
    atl = atl * (1 - atlDecay) + load * atlDecay
    const tsb = ctl - atl

    let status = 'Grey / Maintenance'
    let tone = 'neutral'
    if (tsb > 25) {
      status = 'Very Fresh / Transition'
      tone = 'warn'
    } else if (tsb >= 5) {
      status = 'Fresh / Race Ready'
      tone = 'good'
    } else if (tsb >= -10) {
      status = 'Maintenance'
      tone = 'neutral'
    } else if (tsb >= -30) {
      status = 'Optimal Progressive Overload'
      tone = 'good'
    } else {
      status = 'High Fatigue / Overreaching Risk'
      tone = 'bad'
    }

    series.push({
      date: dateStr,
      load: Math.round(load),
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round(tsb * 10) / 10,
      status,
      tone,
    })

    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  return series
}

/**
 * HRV 7-Day Rolling Baseline & Smallest Worthwhile Change (SWC) Bands.
 *
 * Implements Plews et al. (2013) sports science protocol:
 * Uses natural log transformation ln(rMSSD) with a 7-day rolling mean ± 0.5 × SD.
 */
export function hrvAutonomicBands(bodyComp = []) {
  const points = bodyComp
    .filter((m) => m?.measured_at && m?.hrv_ms != null && Number(m.hrv_ms) > 0)
    .map((m) => ({
      date: m.measured_at.slice(0, 10),
      hrv: Number(m.hrv_ms),
      lnHrv: Math.log(Number(m.hrv_ms)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (points.length === 0) return []

  const results = []
  for (let i = 0; i < points.length; i += 1) {
    // 7-day window up to index i
    const window = points.slice(Math.max(0, i - 6), i + 1)
    const lnMean = window.reduce((sum, p) => sum + p.lnHrv, 0) / window.length
    const variance = window.reduce((sum, p) => sum + (p.lnHrv - lnMean) ** 2, 0) / window.length
    const sd = Math.sqrt(variance)
    const swc = 0.5 * (sd || 0.1) // 0.5 × SD is standard SWC

    const baselineHrv = Math.round(Math.exp(lnMean) * 10) / 10
    const lowerBand = Math.round(Math.exp(lnMean - swc) * 10) / 10
    const upperBand = Math.round(Math.exp(lnMean + swc) * 10) / 10

    const current = points[i].hrv
    let autonomicState = 'Balanced'
    let tone = 'good'
    if (current < lowerBand) {
      autonomicState = 'Sympathetic Stress / Overreached'
      tone = 'bad'
    } else if (current > upperBand) {
      autonomicState = 'Parasympathetic Dominance'
      tone = 'warn'
    }

    results.push({
      date: points[i].date,
      hrv: current,
      baselineHrv,
      lowerBand,
      upperBand,
      autonomicState,
      tone,
    })
  }

  return results
}

/**
 * Daily Readiness & Recovery Composite Index (0–100).
 *
 * Integrates HRV autonomic status, resting heart rate deviation, and recent fatigue.
 */
export function dailyReadiness({
  hrv,
  hrvBaseline,
  restingHr,
  restingHrBaseline,
  recentTsb,
} = {}) {
  // The neutral start is an anchor for real signals to move, not a result in
  // its own right. Without at least one measured input, every rider would see
  // the same invented number and be told they were in optimal condition — the
  // exact fabrication this study cannot afford. Missing means missing.
  let score = 75
  let inputs = 0

  const hrvNow = toNumber(hrv)
  const hrvBase = toNumber(hrvBaseline)
  if (hrvNow !== null && hrvBase !== null && hrvBase > 0) {
    const hrvRatio = hrvNow / hrvBase
    if (hrvRatio >= 1.05) score += 12
    else if (hrvRatio >= 0.95) score += 5
    else if (hrvRatio >= 0.85) score -= 10
    else score -= 25
    inputs += 1
  }

  const rhrNow = toNumber(restingHr)
  const rhrBase = toNumber(restingHrBaseline)
  if (rhrNow !== null && rhrBase !== null && rhrBase > 0) {
    const rhrDiff = rhrNow - rhrBase
    if (rhrDiff <= -2) score += 10
    else if (rhrDiff <= 1) score += 4
    else if (rhrDiff <= 4) score -= 8
    else score -= 20
    inputs += 1
  }

  // TSB is only meaningful once rides exist to compute it from; callers pass
  // null rather than 0 when the performance chart is empty.
  const tsb = toNumber(recentTsb)
  if (tsb !== null) {
    if (tsb > 5) score += 8
    else if (tsb >= -15) score += 2
    else if (tsb >= -30) score -= 8
    else score -= 18
    inputs += 1
  }

  if (inputs === 0) return null

  const finalScore = Math.max(10, Math.min(100, Math.round(score)))

  let zone = 'green'
  let label = 'Optimal Readiness'
  let advice = 'Cardiovascular system is fully recovered. Prime condition for threshold, VO2 max intervals, or heavy volume.'

  if (finalScore < 50) {
    zone = 'red'
    label = 'High Fatigue / Overreached'
    advice = 'Autonomic nervous system is under stress. Focus on active recovery in Zone 1, mobility, nutrition, and sleep.'
  } else if (finalScore < 75) {
    zone = 'amber'
    label = 'Steady / Maintenance'
    advice = 'Solid baseline state. Ideal for Zone 2 aerobic endurance or moderate tempo training.'
  }

  return {
    score: finalScore,
    zone,
    label,
    advice,
    // How many of the three signals actually contributed. A score built on one
    // input is a far weaker claim than one built on three, and the UI says so.
    inputs,
  }
}

/**
 * Metabolic Substrate Oxidation Estimator (FatMax Engine).
 *
 * Estimates grams of Fat vs. Carbohydrate burned per session based on fractional HR intensity.
 */
export function substrateOxidation(avgHrValue, durationMin, maxHrValue) {
  const hr = toNumber(avgHrValue)
  const t = toNumber(durationMin)
  const max = toNumber(maxHrValue)

  if (hr === null || t === null || max === null || hr <= 0 || t <= 0 || max <= 0) {
    return null
  }

  const intensity = Math.min(1.0, hr / max)
  // Approximate cycling caloric burn rate (~10-14 kcal/min based on intensity)
  const kcalPerMin = 5 + intensity * 10
  const totalKcal = Math.round(kcalPerMin * t)

  // Substrate split curve based on FatMax crossover concept (Brooks & Mercier, 1994):
  // Zone 1 (<60%): 80% Fat / 20% Carb
  // Zone 2 (60-70% FatMax): 65% Fat / 35% Carb
  // Zone 3 (70-80%): 40% Fat / 60% Carb
  // Zone 4 (80-90%): 15% Fat / 85% Carb
  // Zone 5 (>90%): 5% Fat / 95% Carb
  let fatFraction = 0.5
  if (intensity < 0.6) fatFraction = 0.8
  else if (intensity < 0.7) fatFraction = 0.65
  else if (intensity < 0.8) fatFraction = 0.4
  else if (intensity < 0.9) fatFraction = 0.15
  else fatFraction = 0.05

  const fatKcal = totalKcal * fatFraction
  const carbKcal = totalKcal * (1 - fatFraction)

  // Fat = 9 kcal/g, Carb = 4 kcal/g
  const fatGrams = Math.round(fatKcal / 9)
  const carbGrams = Math.round(carbKcal / 4)

  return {
    totalKcal,
    fatGrams,
    carbGrams,
    fatPercentage: Math.round(fatFraction * 100),
    carbPercentage: Math.round((1 - fatFraction) * 100),
  }
}

