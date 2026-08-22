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

  const elevations = []
  for (const point of points) {
    const ele = elevationOf(point)
    if (ele !== null) elevations.push(ele)
  }

  // No elevation data at all is unknown, not a flat ride.
  if (elevations.length === 0) return null
  if (elevations.length < 3) return 0

  /*
   * Smooth first, then sum. This ordering is the whole trick, and getting it
   * wrong silently reports flat.
   *
   * The obvious approach — ignore any single step smaller than a metre — works
   * only when samples are far apart. A phone logging every few seconds splits a
   * real climb into hundreds of sub-metre steps, every one of which looks like
   * noise on its own, so the entire climb is discarded. A real 6-mile ride
   * imported here logged elevation every ~4 seconds: 262 rising samples, the
   * largest 0.70 m, not one over the threshold, total reported 0 ft against a
   * true 66 ft.
   *
   * Summing every positive step instead is no better in the other direction —
   * on that same ride it gives 154 ft, because barometric jitter accumulates
   * relentlessly over 722 samples.
   *
   * Averaging over a short window removes the jitter while leaving the trend,
   * so what is summed afterwards is real climbing at whatever rate it happened.
   */
  // Step one: average out high-frequency jitter, but only when the track is
  // dense enough for a window to mean anything. Smoothing four points destroys
  // the signal instead of the noise.
  let series = elevations
  if (elevations.length >= 30) {
    const radius = Math.min(10, Math.max(2, Math.round(elevations.length / 60)))
    series = elevations.map((_, i) => {
      const from = Math.max(0, i - radius)
      const to = Math.min(elevations.length - 1, i + radius)
      let sum = 0
      for (let j = from; j <= to; j += 1) sum += elevations[j]
      return sum / (to - from + 1)
    })
  }

  /*
   * Step two: hysteresis. A rise counts once it clears the threshold measured
   * from the low point it started at — never per adjacent sample.
   *
   * That distinction is the fix. Thresholding each step asks "was this instant
   * a big climb", which a steady gradient never is at a 4-second sample rate,
   * so a genuine 66 ft was reported as 0. Measuring from the trough asks "has
   * the rider actually gained height since the bottom", which is the question
   * that was meant all along.
   */
  let gain = 0
  let trough = series[0]
  let peak = series[0]

  for (const e of series) {
    if (e > peak) peak = e
    if (e < trough) {
      // A new low: whatever was being tracked was a dip, not a climb.
      trough = e
      peak = e
    }
    if (peak - trough > ELEVATION_NOISE_M) {
      gain += peak - trough
      trough = peak
    }
  }

  return gain
}

/**
 * A ride's climb in feet, preferring the stored column but healing bad values.
 *
 * Rides imported before the gain algorithm was fixed carry a stored 0 while
 * their track plainly climbs — the old per-sample threshold discarded every
 * step of a steady gradient. A stored 0 is therefore only trusted when the
 * track agrees it is flat; otherwise the track wins. A genuinely flat ride
 * recomputes to roughly zero anyway, so this costs nothing and repairs every
 * affected ride without a migration or a re-import.
 */
export function rideClimbFeet(ride) {
  const stored =
    ride?.elevation_ft === null || ride?.elevation_ft === undefined || ride?.elevation_ft === ''
      ? null
      : Number(ride.elevation_ft)

  const trusted = stored !== null && Number.isFinite(stored) && stored > 0
  if (trusted) return Math.round(stored)

  const metres = elevationGainMeters(ride?.track)
  if (metres === null) return stored !== null && Number.isFinite(stored) ? Math.round(stored) : null
  return Math.round(metres * METERS_TO_FEET)
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
