/**
 * Track point format and accessors.
 *
 * A track point is `[lat, lon, epochMs, elevationM, heartRate]`.
 *
 * It used to be `[lat, lon, epochMs]`, and rides recorded before elevation and
 * heart rate were stored still hold three-element points in the same jsonb
 * column. Widening the tuple therefore needed no migration — but it does mean
 * every reader must cope with a point that simply stops after index 2. That is
 * the entire reason this module exists: nothing else should index into a track
 * directly, because `point[3]` on an older ride is `undefined`, and `undefined`
 * quietly becomes `NaN` or `0` the moment it reaches arithmetic.
 *
 * Elevation is stored in **metres**, the unit GPX uses natively. Conversion to
 * feet happens at display time only, so no rounding error accumulates in the
 * stored data.
 */

export const LAT = 0
export const LON = 1
export const TIME = 2
export const ELEVATION = 3
export const HEART_RATE = 4

export const METERS_TO_FEET = 3.28084

/**
 * Elevation and GPS both jitter by a metre or two at rest. Summing every
 * positive change would accumulate hundreds of phantom feet over a long ride,
 * so changes below this are treated as noise rather than climbing.
 */
export const ELEVATION_NOISE_M = 1

function numberAt(point, index) {
  if (!Array.isArray(point)) return null
  const value = point[index]
  // Covers undefined (an older three-element point), null, and ''. Number(null)
  // is 0 and finite, so an explicit check has to come first.
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function latOf(point) {
  return numberAt(point, LAT)
}

export function lonOf(point) {
  return numberAt(point, LON)
}

/**
 * Epoch milliseconds, or null.
 *
 * Zero is treated as absent: the GPX parser writes 0 for a point that carried
 * no timestamp, and reading that as the epoch would date a ride to 1970 and
 * report efforts lasting decades.
 */
export function timeOf(point) {
  const t = numberAt(point, TIME)
  return t !== null && t > 0 ? t : null
}

export function elevationOf(point) {
  return numberAt(point, ELEVATION)
}

export function heartRateOf(point) {
  const hr = numberAt(point, HEART_RATE)
  // A recorded zero is a dropped sensor, not a stopped heart.
  return hr !== null && hr > 0 ? hr : null
}

/** Whether a track carries per-point elevation — false for pre-widening rides. */
export function hasElevation(track) {
  return Array.isArray(track) && track.some((p) => elevationOf(p) !== null)
}

/** Whether a track carries per-point heart rate. */
export function hasHeartRate(track) {
  return Array.isArray(track) && track.some((p) => heartRateOf(p) !== null)
}

/**
 * Total climb across a run of points, in metres.
 *
 * Only positive changes count, and only those above the noise floor.
 */
export function elevationGainMeters(points) {
  if (!Array.isArray(points) || points.length < 2) return null

  let gain = 0
  let previous = null
  let sawAny = false

  for (const point of points) {
    const ele = elevationOf(point)
    if (ele === null) continue
    sawAny = true
    if (previous !== null) {
      const delta = ele - previous
      if (delta > ELEVATION_NOISE_M) gain += delta
    }
    previous = ele
  }

  // No elevation data at all is unknown, not a flat ride.
  return sawAny ? gain : null
}

/** Mean heart rate across a run of points, or null if none carry one. */
export function averageHeartRate(points) {
  if (!Array.isArray(points)) return null
  let sum = 0
  let count = 0
  for (const point of points) {
    const hr = heartRateOf(point)
    if (hr === null) continue
    sum += hr
    count += 1
  }
  return count > 0 ? Math.round(sum / count) : null
}
