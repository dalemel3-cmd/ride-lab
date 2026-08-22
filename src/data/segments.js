/**
 * GPS segment detection.
 *
 * The scientific problem this solves: comparing whole rides is a poor measure
 * of fitness, because the terrain changes underneath you. A 12-mile day on
 * Slaughter Pen and a 4-mile day on Slaughter Pen are not the same test, and
 * `routeProgress` in metrics.js can only tell them apart by the name typed into
 * the form. Beats-per-mile has the same weakness in a milder form — it is
 * grouped by surface, but "singletrack" covers everything from flowing to
 * brutal.
 *
 * A segment fixes that completely. It is a stretch of ground you have ridden
 * more than once, matched by GPS rather than by name, so every effort on it
 * covers the identical distance over the identical dirt. Any change in time or
 * heart rate across those efforts is a change in the rider, because nothing
 * else was allowed to vary. That makes it the cleanest physiological claim this
 * app can make over sixteen weeks.
 *
 * Everything here is a pure function of the ride rows it is handed, so the
 * matching can be checked against hand-built tracks in tests/segments.js.
 */

import { haversineMiles } from './metrics.js'
import { recordDate } from './dates.js'

/**
 * How far apart two points can be and still count as "the same place".
 *
 * Consumer GPS is accurate to roughly 5–10 m in the open and considerably
 * worse under the tree cover that most of Bentonville's singletrack runs
 * through. Too tight and the same trail fails to match itself on a cloudy day;
 * too loose and parallel trails a few metres apart merge into one. 35 m is
 * comfortably outside normal drift and inside the spacing of distinct trails.
 */
export const MATCH_TOLERANCE_MI = 35 / 1609.344

/**
 * Track points are resampled to a fixed spacing before matching.
 *
 * Raw GPX points are spaced by *time*, not distance, so a climb has points
 * every few metres and a descent has them every twenty. Comparing those two
 * sequences directly compares sampling rates rather than routes. Resampling by
 * distance makes index-to-index comparison meaningful.
 */
export const RESAMPLE_SPACING_MI = 20 / 1609.344

/**
 * Shortest run of matched ground that counts as a segment.
 *
 * Below about a quarter mile, GPS noise and the few seconds spent stopped at a
 * trailhead dominate the time, so the comparison measures neither fitness nor
 * terrain. It also stops every ride that starts at the same driveway from
 * generating a "segment" out of the first thirty seconds.
 */
export const MIN_SEGMENT_MI = 0.25

/** Grid cell size for the anchor index. Comfortably larger than the tolerance. */
const CELL_MI = MATCH_TOLERANCE_MI * 3

/**
 * Resample a raw track to even spacing, carrying interpolated timestamps.
 *
 * Returns `[lat, lon, t]` triples like the input. Points with no usable
 * timestamp keep a null time rather than a zero, so an effort over a stretch
 * with missing times is reported as untimed instead of instantaneous.
 */
export function resampleTrack(track, spacingMi = RESAMPLE_SPACING_MI) {
  if (!Array.isArray(track) || track.length < 2) return []

  const clean = track.filter(
    (p) => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])),
  )
  if (clean.length < 2) return []

  const timeOf = (p) => {
    const t = Number(p[2])
    // gpx.js writes 0 for a point that carried no timestamp.
    return Number.isFinite(t) && t > 0 ? t : null
  }

  const out = [[Number(clean[0][0]), Number(clean[0][1]), timeOf(clean[0])]]
  let carry = 0

  for (let i = 1; i < clean.length; i += 1) {
    const prev = clean[i - 1]
    const cur = clean[i]
    const legMi = haversineMiles(prev, cur)
    if (!(legMi > 0)) continue

    const tPrev = timeOf(prev)
    const tCur = timeOf(cur)
    let travelled = carry

    // Drop a point every `spacingMi` along this leg, interpolating position and
    // time linearly. Legs are short enough that straight-line interpolation is
    // well inside the matching tolerance.
    while (travelled + spacingMi <= legMi) {
      travelled += spacingMi
      const f = travelled / legMi
      out.push([
        Number(prev[0]) + (Number(cur[0]) - Number(prev[0])) * f,
        Number(prev[1]) + (Number(cur[1]) - Number(prev[1])) * f,
        tPrev !== null && tCur !== null ? tPrev + (tCur - tPrev) * f : null,
      ])
    }
    carry = travelled - legMi
  }

  const last = clean[clean.length - 1]
  out.push([Number(last[0]), Number(last[1]), timeOf(last)])
  return out
}

/** Grid key for the anchor index. Longitude cells shrink with latitude. */
function cellKey(lat, lon) {
  const latDeg = CELL_MI / 69.0
  const lonDeg = CELL_MI / Math.max(1e-6, 69.0 * Math.cos((lat * Math.PI) / 180))
  return `${Math.floor(lat / latDeg)}:${Math.floor(lon / lonDeg)}`
}

/**
 * Index a resampled track by grid cell so candidate matches can be found
 * without comparing every point against every other point.
 */
function buildIndex(points) {
  const index = new Map()
  for (let i = 0; i < points.length; i += 1) {
    const key = cellKey(points[i][0], points[i][1])
    if (!index.has(key)) index.set(key, [])
    index.get(key).push(i)
  }
  return index
}

/**
 * Candidate indices in `points` near `point`.
 *
 * Checks the eight neighbouring cells as well as the containing one: a point
 * sitting just inside a cell boundary has its true match in the cell next door,
 * and missing those would make matching depend on where the grid happens to
 * fall rather than on where the rider rode.
 */
function nearbyIndices(index, points, point) {
  const latDeg = CELL_MI / 69.0
  const lonDeg = CELL_MI / Math.max(1e-6, 69.0 * Math.cos((point[0] * Math.PI) / 180))
  const baseLat = Math.floor(point[0] / latDeg)
  const baseLon = Math.floor(point[1] / lonDeg)

  const found = []
  for (let dLat = -1; dLat <= 1; dLat += 1) {
    for (let dLon = -1; dLon <= 1; dLon += 1) {
      const bucket = index.get(`${baseLat + dLat}:${baseLon + dLon}`)
      if (!bucket) continue
      for (const i of bucket) {
        if (haversineMiles(point, points[i]) <= MATCH_TOLERANCE_MI) found.push(i)
      }
    }
  }
  return found
}

/**
 * Longest run of ground that two resampled tracks share.
 *
 * Anchors on a matching pair of points, then walks both tracks forward while
 * they stay within tolerance. `step` is +1 for two riders travelling the same
 * way and -1 for opposite directions — a trail ridden backwards is still the
 * same trail, and a study that ignored that would throw away half its data.
 *
 * Returns null when nothing long enough is shared.
 */
export function longestSharedRun(a, b) {
  if (a.length < 2 || b.length < 2) return null

  const indexB = buildIndex(b)
  let best = null

  // Anchors are sampled rather than exhaustive. A shared stretch long enough to
  // qualify spans many resampled points, so it cannot slip between anchors
  // spaced a few points apart, and the saving is large on long rides.
  const anchorStride = Math.max(1, Math.floor(MIN_SEGMENT_MI / RESAMPLE_SPACING_MI / 4))

  for (let ai = 0; ai < a.length; ai += anchorStride) {
    for (const bi of nearbyIndices(indexB, b, a[ai])) {
      for (const step of [1, -1]) {
        // Walk backwards from the anchor to find the true start, then forwards
        // to the end; anchoring mid-segment is the common case.
        let startA = ai
        let startB = bi
        while (
          startA - 1 >= 0 &&
          startB - step >= 0 &&
          startB - step < b.length &&
          haversineMiles(a[startA - 1], b[startB - step]) <= MATCH_TOLERANCE_MI
        ) {
          startA -= 1
          startB -= step
        }

        let endA = ai
        let endB = bi
        while (
          endA + 1 < a.length &&
          endB + step >= 0 &&
          endB + step < b.length &&
          haversineMiles(a[endA + 1], b[endB + step]) <= MATCH_TOLERANCE_MI
        ) {
          endA += 1
          endB += step
        }

        const spanA = endA - startA
        if (spanA < 1) continue
        if (best === null || spanA > best.endA - best.startA) {
          best = { startA, endA, startB, endB, step }
        }
      }
    }
  }

  if (!best) return null

  let distanceMi = 0
  for (let i = best.startA + 1; i <= best.endA; i += 1) {
    distanceMi += haversineMiles(a[i - 1], a[i])
  }
  if (distanceMi < MIN_SEGMENT_MI) return null

  return { ...best, distanceMi }
}

/** Elapsed minutes across a slice of a resampled track, or null if untimed. */
function elapsedMinutes(points, from, to) {
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  const tStart = points[lo]?.[2]
  const tEnd = points[hi]?.[2]
  if (tStart === null || tEnd === null || tStart === undefined || tEnd === undefined) return null
  const minutes = Math.abs(tEnd - tStart) / 60000
  return minutes > 0 ? Math.round(minutes * 100) / 100 : null
}

/** Rides carrying enough GPS to take part in matching. */
function trackedRides(rides) {
  return rides
    .filter((r) => Array.isArray(r.track) && r.track.length >= 2)
    .map((r) => ({ ride: r, points: resampleTrack(r.track) }))
    .filter((r) => r.points.length >= 2)
    .sort((a, b) => String(a.ride.ridden_at).localeCompare(String(b.ride.ridden_at)))
}

/**
 * Find every stretch ridden more than once, with each effort over it.
 *
 * Segments are discovered against the earliest ride that contains them, so a
 * segment's identity stays stable as new rides arrive rather than being
 * renumbered every time the study grows.
 *
 * Each returned segment carries its efforts oldest-first, with the fastest
 * marked, plus the first-to-latest change in time and heart rate — the actual
 * finding, terrain held constant.
 */
export function findSegments(rides = [], { minEfforts = 2 } = {}) {
  const tracked = trackedRides(rides)
  if (tracked.length < 2) return []

  const segments = []

  for (let i = 0; i < tracked.length; i += 1) {
    for (let j = i + 1; j < tracked.length; j += 1) {
      const shared = longestSharedRun(tracked[i].points, tracked[j].points)
      if (!shared) continue

      const geometry = tracked[i].points.slice(shared.startA, shared.endA + 1)

      // Fold into an existing segment when this is the same ground found again
      // from a different pair, rather than reporting one stretch many times.
      const existing = segments.find((s) => sameGround(s.geometry, geometry))
      const target = existing ?? {
        id: `${tracked[i].ride.id ?? i}-${shared.startA}`,
        geometry,
        distanceMi: Math.round(shared.distanceMi * 100) / 100,
        efforts: [],
        seen: new Set(),
      }

      for (const [source, from, to] of [
        [tracked[i], shared.startA, shared.endA],
        [tracked[j], shared.startB, shared.endB],
      ]) {
        const rideId = source.ride.id ?? source.ride.ridden_at
        if (target.seen.has(rideId)) continue
        target.seen.add(rideId)

        const minutes = elapsedMinutes(source.points, from, to)
        target.efforts.push({
          rideId,
          date: recordDate(source.ride),
          routeName: source.ride.route_name ?? null,
          durationMin: minutes,
          // Average HR is the ride's, not the segment's: GPX heart rate is not
          // carried on the stored track. It is a fair comparison between two
          // efforts on the same ground, but it is a ride-level figure and the
          // UI labels it as one rather than implying per-segment precision.
          avgHr: toFiniteOrNull(source.ride.avg_hr),
          speedMph: minutes ? Math.round((target.distanceMi / (minutes / 60)) * 10) / 10 : null,
        })
      }

      if (!existing) segments.push(target)
    }
  }

  return segments
    .filter((s) => s.efforts.length >= minEfforts)
    .map(finalizeSegment)
    .sort((a, b) => b.efforts.length - a.efforts.length || b.distanceMi - a.distanceMi)
}

function toFiniteOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Whether two matched stretches describe the same ground.
 *
 * Compares endpoints in both orientations, since the same trail found from a
 * different pair of rides may have been walked in the opposite direction.
 */
function sameGround(a, b) {
  if (!a.length || !b.length) return false
  const near = (p, q) => haversineMiles(p, q) <= MATCH_TOLERANCE_MI * 2
  const aStart = a[0]
  const aEnd = a[a.length - 1]
  const bStart = b[0]
  const bEnd = b[b.length - 1]
  return (near(aStart, bStart) && near(aEnd, bEnd)) || (near(aStart, bEnd) && near(aEnd, bStart))
}

/** Attach the comparison that makes a segment worth showing. */
function finalizeSegment(segment) {
  const efforts = [...segment.efforts].sort((a, b) => a.date.localeCompare(b.date))
  const timed = efforts.filter((e) => e.durationMin !== null)

  const fastest = timed.reduce(
    (best, e) => (best === null || e.durationMin < best.durationMin ? e : best),
    null,
  )

  const first = timed[0] ?? null
  const latest = timed.length > 1 ? timed[timed.length - 1] : null

  const withHr = efforts.filter((e) => e.avgHr !== null)
  const firstHr = withHr[0] ?? null
  const latestHr = withHr.length > 1 ? withHr[withHr.length - 1] : null

  return {
    id: segment.id,
    geometry: segment.geometry,
    distanceMi: segment.distanceMi,
    efforts: efforts.map((e) => ({ ...e, isFastest: fastest !== null && e.rideId === fastest.rideId })),
    fastest,
    // Null rather than zero whenever there is nothing to compare: a single
    // timed effort is not evidence of a trend in either direction.
    timeChangeMin:
      first && latest ? Math.round((latest.durationMin - first.durationMin) * 100) / 100 : null,
    hrChange: firstHr && latestHr ? latestHr.avgHr - firstHr.avgHr : null,
  }
}
