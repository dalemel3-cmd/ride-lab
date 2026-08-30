/**
 * Ride with GPS trip → Ride Lab ride.
 *
 * Kept pure and separate from the sync so it can be tested against the exact
 * payload the API documents, without a database or a token. The numbers this
 * produces are the study's numbers, so they get checked the same way the rest
 * of the physiology does.
 *
 * Why this provider exists alongside Strava: Strava's activity list returns
 * `map.summary_polyline`, which decodes to [lat, lng] pairs and nothing else.
 * Ride with GPS returns trip track points carrying `h` (heart rate, bpm), `t`
 * (unix seconds) and `e` (metres) — the tuple this app's `track` column stores.
 * Time in zones, the Seiler polarized audit and the 5-zone breakdown all need a
 * continuous heart-rate trace, and until now that only arrived via a GPX file
 * imported by hand.
 *
 * Reference: https://ridewithgps.com/api (endpoints/trips.json,
 * reference/track_points.md).
 */

const METERS_TO_MILES = 0.000621371
const METERS_TO_FEET = 3.28084

/** Track tuple positions, mirrored from src/data/track.js. */
const TRACK_LAT = 0
const TRACK_LNG = 1
const TRACK_TIME = 2
const TRACK_ELEV = 3
const TRACK_HR = 4

export type TrackPoint = [number, number, number | null, number | null, number | null]

/** A finite number, or null. Treats "absent" as absent rather than as zero. */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Round to an integer inside a range, or null.
 *
 * The rides table enforces these ranges with CHECK constraints, and a single
 * out-of-range value fails the entire batch upsert rather than one row. The
 * example payload in the API docs carries a max_hr of 238, so strap dropouts
 * and spikes are demonstrably real rather than hypothetical — dropping the
 * value keeps the rest of the ride.
 */
function bounded(value: unknown, min: number, max: number): number | null {
  const n = num(value)
  if (n === null) return null
  const rounded = Math.round(n)
  return rounded >= min && rounded <= max ? rounded : null
}

/** Map a Ride with GPS activity_type onto our four-surface vocabulary. */
export function surfaceForActivityType(activityType: unknown): string | null {
  switch (activityType) {
    case 'cycling:mountain':
    case 'cycling:cyclocross':
      return 'singletrack'
    case 'cycling:gravel':
      return 'gravel'
    case 'cycling:road':
    case 'cycling:commute':
    case 'cycling:generic':
    case 'cycling:virtual':
    case 'cycling:indoor':
      return 'road'
    // Anything not on a bike — running, walking, a motorcycle — has no surface
    // in this study's sense, and guessing one would file it as a ride.
    default:
      return null
  }
}

/** True for trips this cycling study should import at all. */
export function isCyclingTrip(trip: Record<string, unknown> | null | undefined): boolean {
  const type = trip?.activity_type
  // A trip with no activity_type set is still almost certainly a ride in a
  // cycling app; excluding it would silently drop rides.
  if (type == null || type === '') return true
  return typeof type === 'string' && type.startsWith('cycling:')
}

/**
 * Convert track points to the app's tuple, with time relative to the first
 * point, in the units src/data/track.js documents.
 *
 * That contract is `[lat, lon, epochMs, elevationM, heartRate]`, and it is not
 * negotiable — every reader in the app (timeInZones, the elevation profile,
 * segment detection) indexes these positions and assumes those units. The first
 * version of this function rebased time to seconds-from-start and converted
 * elevation to feet, inventing a second format the rest of the app cannot read:
 * a 43-minute ride was scored as 2.6 seconds of training, and 390 m of Ozark
 * plateau displayed as 4,196 ft.
 *
 * Ride with GPS gives `t` as absolute unix seconds and `e` as metres, so both
 * conversions are trivial — the earlier code was doing extra work to get it
 * wrong.
 */
export function toTrack(points: unknown): TrackPoint[] {
  if (!Array.isArray(points)) return []

  const usable = points.filter(
    (p) => p && typeof p === 'object' && num((p as Record<string, unknown>).y) !== null &&
      num((p as Record<string, unknown>).x) !== null,
  ) as Record<string, unknown>[]

  return usable.map((p) => {
    const t = num(p.t)
    const tuple = new Array(5).fill(null) as TrackPoint
    tuple[TRACK_LAT] = num(p.y) as number
    tuple[TRACK_LNG] = num(p.x) as number
    // Unix seconds → epoch milliseconds. Not rebased: track.js reads position 2
    // as an absolute instant, and treats 0 as "no timestamp" — so a rebased
    // track would also silently lose its own first point.
    tuple[TRACK_TIME] = t !== null && t > 0 ? Math.round(t * 1000) : null
    // Metres, stored as given. Conversion to feet happens at display time so no
    // rounding error accumulates in the stored data.
    tuple[TRACK_ELEV] = num(p.e)
    // Zero is a dropped strap reading, not a heart rate.
    tuple[TRACK_HR] = bounded(num(p.h) === 0 ? null : p.h, 30, 240)
    return tuple
  })
}

/** Does this track carry a real heart-rate trace? */
export function trackHasHeartRate(track: TrackPoint[]): boolean {
  return track.some((p) => p[TRACK_HR] != null)
}

/**
 * Build the ride row for one trip detail payload.
 *
 * Returns null for anything that is not a ride, so the caller can skip it.
 */
export function tripToRide(
  trip: Record<string, unknown> | null | undefined,
  userId: string,
): Record<string, unknown> | null {
  if (!trip || trip.id == null || !isCyclingTrip(trip)) return null

  const track = toTrack(trip.track_points)

  // moving_time excludes time spent stopped, which is what a training log
  // should count — `duration` is elapsed and would inflate every ride that
  // paused at a junction. Falls back to duration when the device recorded no
  // moving time at all.
  const movingSec = num(trip.moving_time) ?? num(trip.duration)
  const distanceM = num(trip.distance)
  const gainM = num(trip.elevation_gain)

  return {
    user_id: userId,
    source: 'ridewithgps',
    external_id: String(trip.id),
    ridden_at: trip.departed_at ?? null,
    route_name: (trip.name as string) || null,
    notes: (trip.description as string) || null,
    distance_mi: distanceM !== null ? Math.round(distanceM * METERS_TO_MILES * 100) / 100 : null,
    duration_min: movingSec !== null ? Math.round((movingSec / 60) * 10) / 10 : null,
    elevation_ft: gainM !== null ? Math.round(gainM * METERS_TO_FEET) : null,
    avg_hr: bounded(trip.avg_hr, 30, 240),
    max_hr: bounded(trip.max_hr, 30, 240),
    cadence_avg_rpm: bounded(trip.avg_cad, 20, 220),
    power_avg_watts: bounded(trip.avg_watts, 0, 2500),
    power_max_watts: bounded(trip.max_watts, 0, 3000),
    calories: bounded(trip.calories, 0, 100000),
    surface: surfaceForActivityType(trip.activity_type),
    // No device reports RPE. Deriving one from heart rate would fabricate the
    // study's only subjective measure, so it stays null to be filled in.
    rpe: null,
    // A single point is a start location, not a route.
    track: track.length > 1 ? track : null,
  }
}
