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
