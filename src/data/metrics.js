/**
 * Derived metrics for the case study.
 *
 * Everything here is a pure function of its arguments — no dates, no storage, no
 * React. That makes the physiology testable against known values (see
 * tests/metrics.js), which matters because these numbers are the actual claims
 * the case study makes.
 */

import { startOfWeek, toDateString, recordDate } from './dates.js'
import { ACWR_THRESHOLDS, FOSTER_MONOTONY_THRESHOLDS } from '../settings.js'

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
// Track tuple positions, mirrored from track.js. Kept as local constants so
// metrics.js stays dependency-free and provably pure.
const TRACK_TIME = 2
const TRACK_HR = 4

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

/**
 * Time spent in each heart-rate zone across a track, in seconds.
 *
 * The single most useful thing per-point heart rate unlocks. A ride's average
 * heart rate hides its shape completely: 145 bpm average can be an hour of
 * steady Zone 2, or half an hour of Zone 1 spliced with half an hour of Zone 4,
 * and those two rides do entirely different things to a body. Only the
 * distribution tells them apart.
 *
 * It is also what makes the study's central claim checkable. Polarized training
 * says roughly 80% of time should sit easy and 20% hard, with little in the
 * middle — and riders overwhelmingly believe they ride easier than they do.
 * This measures it instead of asking.
 *
 * Returns null when the track carries no heart rate, rather than five zeroes
 * that would read as "no time in any zone".
 */
export function timeInZones(track, maxHrValue) {
  const max = toNumber(maxHrValue)
  if (!Array.isArray(track) || track.length < 2 || max === null || max <= 0) return null

  // A gap longer than this is a pause, a tunnel, or a dropped sensor — not time
  // spent at the last-known heart rate. Counting it would attribute a coffee
  // stop to whatever zone the rider was in when they stopped.
  const MAX_GAP_SEC = 60

  const seconds = new Map(HR_ZONES.map((z) => [z.zone, 0]))
  let total = 0

  for (let i = 1; i < track.length; i += 1) {
    const from = track[i - 1]
    const t1 = toNumber(from?.[TRACK_TIME])
    const t2 = toNumber(track[i]?.[TRACK_TIME])
    const hr = toNumber(from?.[TRACK_HR])

    if (t1 === null || t2 === null || t1 <= 0 || t2 <= 0 || hr === null || hr <= 0) continue

    const gap = (t2 - t1) / 1000
    if (!(gap > 0) || gap > MAX_GAP_SEC) continue

    const z = hrZone(hr, max)
    if (!z) continue

    seconds.set(z.zone, seconds.get(z.zone) + gap)
    total += gap
  }

  if (total <= 0) return null

  return HR_ZONES.map((z) => ({
    zone: z.zone,
    label: z.label,
    color: z.color,
    effect: z.effect,
    seconds: Math.round(seconds.get(z.zone)),
    percent: Math.round((seconds.get(z.zone) / total) * 100),
  }))
}

/**
 * Sum several zone distributions into one.
 *
 * Used to ask the polarization question across a whole study rather than a
 * single ride, which is the timescale the 80/20 guideline actually describes.
 */
export function combineZoneTimes(distributions = []) {
  const usable = distributions.filter(Array.isArray)
  if (usable.length === 0) return null

  const totals = new Map(HR_ZONES.map((z) => [z.zone, 0]))
  let total = 0

  for (const dist of usable) {
    for (const entry of dist) {
      totals.set(entry.zone, (totals.get(entry.zone) ?? 0) + entry.seconds)
      total += entry.seconds
    }
  }

  if (total <= 0) return null

  return HR_ZONES.map((z) => ({
    zone: z.zone,
    label: z.label,
    color: z.color,
    effect: z.effect,
    seconds: totals.get(z.zone),
    percent: Math.round((totals.get(z.zone) / total) * 100),
  }))
}

/**
 * VAM — velocità ascensionale media, metres climbed per hour.
 *
 * The standard climbing benchmark in cycling, and a good one for this study
 * because it is almost pure aerobic power-to-weight: on a sustained climb,
 * nearly all the work goes into lifting rider plus bike against gravity, so
 * neither a fast descent nor a tailwind can flatter it. Recreational riders sit
 * around 500–900 m/h on a steady climb; it rises with fitness and falls with
 * weight, which is exactly the pair of things this study is tracking.
 *
 * Only meaningful over ground that actually climbs, so callers should not show
 * it for a flat segment.
 */
export function vam(elevationGainM, durationMin) {
  const gain = toNumber(elevationGainM)
  const t = toNumber(durationMin)
  if (gain === null || t === null || gain <= 0 || t <= 0) return null
  return Math.round(gain / (t / 60))
}

/**
 * Average gradient across a stretch, as a percentage.
 *
 * Climb divided by horizontal distance. Used to decide whether a segment is a
 * climb worth quoting VAM for.
 */
export function gradePercent(elevationGainM, distanceMi) {
  const gain = toNumber(elevationGainM)
  const d = toNumber(distanceMi)
  if (gain === null || d === null || d <= 0) return null
  const distanceM = d * 1609.344
  return Math.round((gain / distanceM) * 1000) / 10
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
/**
 * Rides that may be used to make a claim about fitness.
 *
 * An excluded ride is still a ride — it counts toward volume, duration and
 * training load, because the body did that work. What it must not do is anchor
 * an adaptation trend. Two rides in this study were ridden with a crank arm
 * working loose, and one of them was the first point in the efficiency series,
 * so every "since baseline" figure was measured from a mechanical failure.
 */
export function analysable(rides = []) {
  return rides.filter((r) => !r?.excluded)
}

export function efficiencyBySurface(rides = []) {
  const groups = new Map()

  for (const ride of analysable(rides).sort((a, b) => String(a.ridden_at).localeCompare(String(b.ridden_at)))) {
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
 * The heart-rate window the aerobic-efficiency trend is measured in.
 *
 * Zone 2 for a 190 max, and deliberately narrow. The point is to hold
 * physiological cost constant so that any change in speed is a change in the
 * rider, so a wide band would defeat the exercise.
 */
export const EFFICIENCY_BAND = { minHr: 120, maxHr: 135 }

/** Below this there is not enough of a ride in the band to mean anything. */
export const MIN_BAND_MINUTES = 5

/**
 * Average speed while heart rate sat inside a band, from a continuous trace.
 *
 * This is the metric beats-per-mile wanted to be. Beats-per-mile is confounded
 * by intensity — the same rider scores 661 on a tempo ride and 700 on an easier
 * one — so a trend built from it mostly records which intensity was chosen that
 * day. Holding heart rate fixed and watching speed removes that: the same
 * cardiac cost, over months, should buy more miles per hour.
 *
 * Only legs where *both* endpoints sit in the band are counted, so the sample
 * is time genuinely spent at that effort rather than time passing through it.
 * Long gaps are dropped for the same reason timeInZones drops them — a pause is
 * not time spent at the last-known heart rate.
 *
 * Returns null when the ride has no usable trace, which is the honest answer
 * for a manually entered ride with no per-point data.
 */
export function speedAtHeartRate(track, { minHr, maxHr } = EFFICIENCY_BAND) {
  if (!Array.isArray(track) || track.length < 2) return null

  // Matches timeInZones: beyond a minute, the rider stopped.
  const MAX_GAP_SEC = 60
  // A leg faster than this is a GPS jump, not a bicycle.
  const MAX_LEG_MPH = 60

  let miles = 0
  let seconds = 0

  for (let i = 1; i < track.length; i += 1) {
    const from = track[i - 1]
    const to = track[i]

    const hrFrom = toNumber(from?.[TRACK_HR])
    const hrTo = toNumber(to?.[TRACK_HR])
    if (hrFrom === null || hrTo === null) continue
    if (hrFrom < minHr || hrFrom > maxHr || hrTo < minHr || hrTo > maxHr) continue

    const t1 = toNumber(from?.[TRACK_TIME])
    const t2 = toNumber(to?.[TRACK_TIME])
    if (t1 === null || t2 === null || t1 <= 0 || t2 <= 0) continue

    const gap = (t2 - t1) / 1000
    if (!(gap > 0) || gap > MAX_GAP_SEC) continue

    const legMiles = haversineMiles(from, to)
    if (!(legMiles >= 0)) continue
    if (legMiles / (gap / 3600) > MAX_LEG_MPH) continue

    miles += legMiles
    seconds += gap
  }

  if (seconds <= 0 || miles <= 0) return null

  return {
    mph: Math.round((miles / (seconds / 3600)) * 100) / 100,
    minutes: Math.round((seconds / 60) * 10) / 10,
    miles: Math.round(miles * 100) / 100,
  }
}

/**
 * The aerobic-efficiency series: speed at a fixed heart rate, over time.
 *
 * Rides without enough time in the band are left out rather than plotted at
 * whatever their partial sample happened to say — the whole value of this
 * metric is that every point describes the same physiological cost.
 */
export function aerobicEfficiencyTrend(rides = [], options = {}) {
  const { minHr, maxHr } = { ...EFFICIENCY_BAND, ...options }
  const minMinutes = options.minMinutes ?? MIN_BAND_MINUTES

  const points = []
  for (const ride of analysable(rides).sort((a, b) =>
    String(a.ridden_at).localeCompare(String(b.ridden_at)),
  )) {
    const result = speedAtHeartRate(ride.track, { minHr, maxHr })
    if (!result || result.minutes < minMinutes) continue
    points.push({
      date: recordDate(ride),
      route: ride.route_name || 'Ride',
      mph: result.mph,
      minutes: result.minutes,
    })
  }

  return {
    band: { minHr, maxHr },
    points,
    // Faster at the same heart rate is the improvement, so higher is better.
    trend: trendDelta(points.map((p) => p.mph)),
  }
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

  for (const ride of analysable(rides)) {
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
export function performanceManagementChart(
  rides = [],
  {
    ctlDays = 42,
    atlDays = 7,
    // ACWR gets its own window and does not reuse CTL. Gabbett's ratio, and the
    // exponentially-weighted form of it, compare 7 days against 28 — never
    // against 42. Dividing ATL by a 42-day CTL uses a denominator that fills
    // more slowly, which inflates the ratio for a month and a half and is what
    // reported an ACWR of 5.15 in week one as "Danger Zone".
    acwrChronicDays = 28,
    defaultMaxHr = 190,
    // The rider's own measured resting heart rate. TRIMP is a ratio against
    // heart-rate reserve, so assuming 60 for someone who rests at 54 overstates
    // the reserve and understates every session's load.
    restingHr = 60,
  } = {},
) {
  if (!Array.isArray(rides) || rides.length === 0) return []

  // Map total load per calendar date (using either TRIMP or Foster load)
  const dailyLoads = new Map()

  for (const ride of rides) {
    const d = recordDate(ride)
    // Prefer TRIMP if HR exists, otherwise fallback to Foster sRPE (scaled ~ / 3 to match TRIMP units)
    let load = null
    if (ride.avg_hr && ride.duration_min) {
      load = trimp(ride.avg_hr, ride.duration_min, defaultMaxHr, restingHr)
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
  // The last day of the series is today in the rider's own timezone, compared
  // as a date string rather than as an instant. Comparing timestamps against
  // `new Date()` silently dropped today's row until noon UTC — so a ride logged
  // before 7am local carried no load in the chart for another hour, and the
  // same code produced different output depending on when it ran.
  const endDateStr = toDateString()
  // λ = 2/(N+1), the exponentially-weighted moving average used by Williams et
  // al. (2017) for this family of metrics. Worth stating because it is not the
  // only convention: TrainingPeaks decays by 1 − e^(−1/N), which is roughly
  // half as fast, so CTL here is not numerically comparable to a CTL read off
  // TrainingPeaks or Strava. Consistency within the study is what matters, and
  // ACWR below is computed the same way it is published.
  const ctlDecay = 2 / (ctlDays + 1)
  const atlDecay = 2 / (atlDays + 1)
  const acwrChronicDecay = 2 / (acwrChronicDays + 1)

  let ctl = 0
  let atl = 0
  let acwrChronic = 0
  const series = []

  const cur = new Date(startDate)
  let dateStr = cur.toISOString().slice(0, 10)
  while (dateStr <= endDateStr) {
    const load = dailyLoads.get(dateStr) ?? 0

    ctl = ctl * (1 - ctlDecay) + load * ctlDecay
    atl = atl * (1 - atlDecay) + load * atlDecay
    acwrChronic = acwrChronic * (1 - acwrChronicDecay) + load * acwrChronicDecay
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
      acwrChronic: Math.round(acwrChronic * 10) / 10,
      acwr: acwrChronic >= 1 ? Math.round((atl / acwrChronic) * 100) / 100 : null,
      status,
      tone,
    })

    cur.setUTCDate(cur.getUTCDate() + 1)
    dateStr = cur.toISOString().slice(0, 10)
  }

  return series
}

/**
 * How many daily readings a rolling HRV baseline needs before its bands mean
 * anything.
 *
 * Plews works by comparing today against normal variation, and with two or
 * three readings there is no "normal" yet — the SD is tiny, the bands close to
 * a hair's width, and the second reading of the study gets flagged as
 * "Sympathetic Stress / Overreached" for being a few milliseconds off the only
 * other reading. Seven is the protocol's own window; below it the band is
 * reported but the verdict is withheld.
 */
export const MIN_HRV_BASELINE_SAMPLES = 7

/**
 * HRV 7-Day Rolling Baseline & Smallest Worthwhile Change (SWC) Bands.
 *
 * Implements Plews et al. (2013) sports science protocol:
 * Uses natural log transformation ln(rMSSD) with a 7-day rolling mean ± 0.5 × SD.
 *
 * Each result carries `samples` and `baselineEstablished` so a caller can tell
 * a real autonomic reading from one computed off a baseline that does not exist
 * yet. A label is not a measurement.
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
    const baselineEstablished = window.length >= MIN_HRV_BASELINE_SAMPLES

    let autonomicState = 'Balanced'
    let tone = 'good'
    if (!baselineEstablished) {
      // Not a verdict — a statement about how much history exists.
      autonomicState = 'Establishing baseline'
      tone = 'neutral'
    } else if (current < lowerBand) {
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
      samples: window.length,
      baselineEstablished,
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

/**
 * Acute:Chronic Workload Ratio (ACWR - Dr. Tim Gabbett model).
 *
 * ACWR = acute load (7-day) / chronic load (28-day)
 *
 * The denominator is deliberately not CTL, and the parameter is named
 * `chronicLoad` to keep it that way. CTL is this app's 42-day fitness average;
 * Gabbett's ratio and its exponentially-weighted form both compare 7 days
 * against 28. Pass `acwrChronic` from performanceManagementChart. Passing `ctl`
 * still type-checks and still returns a number — it just returns the wrong one,
 * which is how this came to report an ACWR of 5.15 in week one.
 *
 * Sweet Spot (0.8 - 1.3): progressive overload with lowest relative injury risk.
 * Caution Zone (1.3 - 1.5): accelerated fatigue accumulation.
 * Danger Zone (> 1.5): critical spike in acute fatigue; heightened risk of soft tissue injury / overreaching.
 */
export function acwr(atl, chronicLoad, thresholds = ACWR_THRESHOLDS) {
  const a = toNumber(atl)
  const c = toNumber(chronicLoad)

  if (a === null || c === null || c < 1) {
    return null
  }

  const ratio = Math.round((a / c) * 100) / 100
  const undertraining = thresholds?.undertrainingMax ?? 0.8
  const sweetSpotMax = thresholds?.sweetSpotMax ?? 1.3
  const cautionMax = thresholds?.cautionMax ?? 1.5

  let zone = 'sweet-spot'
  let label = 'Optimal Sweet Spot'
  let tone = 'good'
  let description = 'Workload ramp rate is progressive and within the lowest relative injury risk zone.'

  if (ratio < undertraining) {
    zone = 'undertraining'
    label = 'Deload / Undertraining'
    tone = 'neutral'
    description = 'Acute load is below chronic fitness; low injury risk with gradual fitness decay.'
  } else if (ratio <= sweetSpotMax) {
    zone = 'sweet-spot'
    label = 'Optimal Sweet Spot'
    tone = 'good'
    description = 'Workload ramp rate is progressive and within the lowest relative injury risk zone.'
  } else if (ratio <= cautionMax) {
    zone = 'caution'
    label = 'High Overload / Caution'
    tone = 'warn'
    description = 'Rapid load ramp rate. Monitor recovery and avoid consecutive high-intensity days.'
  } else {
    zone = 'danger'
    label = 'Danger Zone'
    tone = 'bad'
    description = 'Spike in acute fatigue exceeds chronic capacity. High risk of maladaptive overreaching.'
  }

  return {
    ratio,
    zone,
    label,
    tone,
    description,
  }
}

/**
 * Carl Foster's Training Monotony & Strain Index (Foster, 1998).
 *
 * Monotony = mean(dailyLoads) / sd(dailyLoads)
 * Strain = totalWeeklyLoad × Monotony
 *
 * Daily loads array must represent consecutive days (rest days = 0).
 * High volume is well-tolerated when monotony is low (varied easy & hard days).
 * High volume + High monotony (≥ 2.0) drastically increases illness and staleness risk.
 */
export function fosterMonotonyAndStrain(dailyLoads = [], thresholds = FOSTER_MONOTONY_THRESHOLDS) {
  if (!Array.isArray(dailyLoads) || dailyLoads.length === 0) return null

  const cleaned = dailyLoads.map((v) => Number(v) || 0)
  const count = cleaned.length
  if (count < 2) return null

  const totalLoad = Math.round(cleaned.reduce((sum, v) => sum + v, 0) * 10) / 10
  if (totalLoad === 0) return null

  const mean = totalLoad / count
  const variance = cleaned.reduce((sum, v) => sum + (v - mean) ** 2, 0) / count
  const sd = Math.sqrt(variance)

  // If SD is zero (identical non-zero load every single day), monotony is clamped to high max
  const rawMonotony = sd === 0 ? 10 : mean / sd
  const monotony = Math.round(rawMonotony * 100) / 100
  const strain = Math.round(totalLoad * monotony)

  const optimalMax = thresholds?.optimalMax ?? 1.5
  const moderateMax = thresholds?.moderateMax ?? 2.0

  let monotonyZone = 'optimal'
  let label = 'Optimal Variation'
  let tone = 'good'
  let description = 'Healthy day-to-day load variation between hard, moderate, and rest days.'

  if (monotony < optimalMax) {
    monotonyZone = 'optimal'
    label = 'Optimal Variation'
    tone = 'good'
    description = 'Healthy day-to-day load variation between hard, moderate, and rest days.'
  } else if (monotony <= moderateMax) {
    monotonyZone = 'moderate'
    label = 'Moderate Monotony'
    tone = 'warn'
    description = 'Daily training is becoming repetitive. Introduce lighter recovery days or polarized contrast.'
  } else {
    monotonyZone = 'high'
    label = 'High Monotony Alert'
    tone = 'bad'
    description = 'Severe lack of day-to-day variation. High vulnerability to staleness and overtraining syndrome.'
  }

  return {
    totalLoad,
    meanDailyLoad: Math.round(mean * 10) / 10,
    sdLoad: Math.round(sd * 10) / 10,
    monotony,
    strain,
    monotonyZone,
    label,
    tone,
    description,
  }
}

/**
 * 7-Day Rolling Training Monotony & Strain helper from a list of rides.
 */
export function weeklyMonotony(
  rides = [],
  { days = 7, defaultMaxHr = 190, restingHr = 60, endDate } = {},
) {
  if (!Array.isArray(rides) || rides.length === 0) return null

  const dailyMap = new Map()

  for (const ride of rides) {
    const d = recordDate(ride)
    let load = null
    if (ride.avg_hr && ride.duration_min) {
      load = trimp(ride.avg_hr, ride.duration_min, defaultMaxHr, restingHr)
    }
    if (load === null && ride.rpe && ride.duration_min) {
      load = Math.round((trainingLoad(ride.rpe, ride.duration_min) / 3) * 10) / 10
    }
    if (load !== null) {
      dailyMap.set(d, (dailyMap.get(d) ?? 0) + load)
    }
  }

  // The window is a run of calendar days in the program timezone, because that
  // is what `recordDate` keyed the loads by above. Stepping the cursor with
  // `toISOString()` read the UTC date instead, so from 7pm Central onward every
  // bucket shifted a day forward: the oldest training day dropped out of the
  // window and a future day of zero load came in. The same seven rides scored
  // 444.2 total load and 17.45 monotony in the morning and 386.1 / 2.43 that
  // evening — a different verdict from the same data on the same day.
  //
  // A bare `YYYY-MM-DD` is taken at face value; anything else is resolved to a
  // calendar date the same way a ride is.
  const endStr =
    typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(endDate)
      ? endDate.slice(0, 10)
      : toDateString(endDate ? new Date(endDate) : new Date())

  // Noon UTC, so adding days can never cross a day boundary by rounding.
  const cursor = new Date(`${endStr}T12:00:00Z`)
  if (Number.isNaN(cursor.getTime())) return null
  cursor.setUTCDate(cursor.getUTCDate() - (days - 1))

  const dailyLoads = []
  for (let i = 0; i < days; i += 1) {
    dailyLoads.push(dailyMap.get(cursor.toISOString().slice(0, 10)) ?? 0)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return fosterMonotonyAndStrain(dailyLoads)
}

/**
 * Polarized Training 80/20 Distribution Audit (Dr. Stephen Seiler 3-Domain Model).
 *
 * Domain 1 (Low / Aerobic Base): 5-Zone Z1 + Z2 — below 70% of max HR
 * Domain 2 (Moderate / Threshold / Grey Zone): 5-Zone Z3 — 70–80% of max HR
 * Domain 3 (High / Severe / VO2 max): 5-Zone Z4 + Z5 — above 80% of max HR
 *
 * Those cut-offs come from HR_ZONES above, not from Seiler. His domains are
 * bounded by the two ventilatory thresholds, which sit nearer 80% and 88% of
 * max HR for a trained rider and have to be measured rather than assumed. This
 * header used to claim 75%/85% — neither the model's numbers nor the code's —
 * which is the kind of detail that costs a study its credibility when someone
 * checks it. Substituting fixed percentages for measured thresholds makes the
 * "low" domain harder to fill, so the audit errs toward calling a distribution
 * threshold-heavy rather than flattering it.
 *
 * Archetype Classifications:
 * - Polarized: Low >= 75% AND High >= Mod (Seiler gold standard)
 * - Pyramidal: Low >= 65% AND Mod >= High (Classic base building)
 * - Threshold-Heavy: Mod >= 20% or Low < 65% (Grey Zone risk / excessive tempo fatigue)
 */
export function polarizedAudit(zoneDistributions) {
  if (!Array.isArray(zoneDistributions) || zoneDistributions.length === 0) return null

  // Sum seconds across zones
  const totalSeconds = zoneDistributions.reduce((sum, z) => sum + (Number(z?.seconds) || 0), 0)
  if (totalSeconds < 60) return null // Need at least 1 minute of tracked HR

  const lowSeconds = zoneDistributions
    .filter((z) => z.zone === 1 || z.zone === 2)
    .reduce((sum, z) => sum + (Number(z?.seconds) || 0), 0)

  const modSeconds = zoneDistributions
    .filter((z) => z.zone === 3)
    .reduce((sum, z) => sum + (Number(z?.seconds) || 0), 0)

  const highSeconds = zoneDistributions
    .filter((z) => z.zone === 4 || z.zone === 5)
    .reduce((sum, z) => sum + (Number(z?.seconds) || 0), 0)

  const lowPct = Math.round((lowSeconds / totalSeconds) * 100)
  const modPct = Math.round((modSeconds / totalSeconds) * 100)
  const highPct = Math.round((highSeconds / totalSeconds) * 100)

  let archetype = 'Polarized'
  let label = 'Polarized (Seiler 80/20)'
  let tone = 'good'
  let description = 'Optimal polarized distribution. High aerobic volume with targeted high-intensity contrast and minimal grey-zone fatigue.'

  if (lowPct >= 75 && highPct >= modPct) {
    archetype = 'Polarized'
    label = 'Polarized (Seiler 80/20)'
    tone = 'good'
    description = 'Optimal polarized distribution. High aerobic volume with targeted high-intensity contrast and minimal grey-zone fatigue.'
  } else if (lowPct >= 65 && modPct >= highPct) {
    archetype = 'Pyramidal'
    label = 'Pyramidal Distribution'
    tone = 'good'
    description = 'Solid aerobic dominance with progressive moderate tempo volume.'
  } else if (modPct >= 20 || lowPct < 65) {
    archetype = 'Threshold-Heavy'
    label = 'Grey Zone Risk (Threshold Heavy)'
    tone = 'warn'
    description = 'Excessive time in Zone 3 ("the black hole"). High physiological fatigue with diminished mitochondrial adaptation.'
  } else {
    archetype = 'Mixed'
    label = 'Mixed Distribution'
    tone = 'neutral'
    description = 'Training distribution is varied across intensity domains.'
  }

  return {
    lowSeconds,
    modSeconds,
    highSeconds,
    totalSeconds,
    lowPct,
    modPct,
    highPct,
    archetype,
    label,
    tone,
    description,
  }
}


