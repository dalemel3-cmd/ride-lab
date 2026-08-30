/**
 * Integration status, disconnect, and sync.
 *
 * One authenticated endpoint with an `action`, so the client needs a single
 * function URL rather than four. Every path resolves the user from their JWT
 * and only ever touches that user's rows.
 *
 * Imports are idempotent: rides carry (source, external_id) with a unique
 * index, and body/journal rows are unique per day per source, so re-running a
 * sync updates what it already created instead of duplicating it.
 */

import {
  adminClient,
  userFromRequest,
  validAccessToken,
  decodePolyline,
  json,
  CORS_HEADERS,
  type Provider,
} from '../_shared/providers.ts'
import {
  tripToRide,
  trackHasHeartRate,
  type TrackPoint,
} from '../_shared/ridewithgps.ts'

const METERS_TO_MILES = 0.000621371
const METERS_TO_FEET = 3.28084

/** Strava activity types that belong in a cycling log. */
const RIDE_TYPES = new Set(['Ride', 'MountainBikeRide', 'GravelRide', 'VirtualRide', 'EBikeRide'])

/** Map a Strava sport type onto our surface vocabulary. */
function surfaceFor(sportType: string): string | null {
  if (sportType === 'MountainBikeRide') return 'singletrack'
  if (sportType === 'GravelRide') return 'gravel'
  if (sportType === 'Ride' || sportType === 'VirtualRide') return 'road'
  return null
}

async function syncStrava(admin: ReturnType<typeof adminClient>, userId: string, sinceDays: number) {
  const token = await validAccessToken(admin, userId, 'strava')
  if (!token) return { connected: false, imported: 0 }

  const after = Math.floor((Date.now() - sinceDays * 86400000) / 1000)
  const response = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  )

  if (!response.ok) {
    throw new Error(`Strava activities failed (${response.status}): ${await response.text()}`)
  }

  const activities = await response.json()
  const rides = (Array.isArray(activities) ? activities : [])
    .filter((a) => RIDE_TYPES.has(a.sport_type ?? a.type))
    .map((a) => {
      const track = decodePolyline(a.map?.summary_polyline ?? '')
      return {
        user_id: userId,
        source: 'strava',
        external_id: String(a.id),
        ridden_at: a.start_date,
        route_name: a.name || null,
        distance_mi: a.distance ? Math.round(a.distance * METERS_TO_MILES * 100) / 100 : null,
        // moving_time excludes time spent stopped, which is what a training log
        // should count — elapsed_time would inflate every easy ride with cafe stops.
        duration_min: a.moving_time ? Math.round((a.moving_time / 60) * 10) / 10 : null,
        elevation_ft: a.total_elevation_gain
          ? Math.round(a.total_elevation_gain * METERS_TO_FEET)
          : null,
        avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
        max_hr: a.max_heartrate ? Math.round(a.max_heartrate) : null,
        surface: surfaceFor(a.sport_type ?? a.type),
        // Strava has no RPE, and guessing one from heart rate would fabricate
        // the most important subjective field in the study. Left null to fill in.
        rpe: null,
        track: track.length > 1 ? track : null,
      }
    })

  if (rides.length === 0) return { connected: true, imported: 0 }

  // ignoreDuplicates keeps a hand-entered RPE from being wiped by a later sync.
  const { error } = await admin
    .from('rides')
    .upsert(rides, { onConflict: 'user_id,source,external_id', ignoreDuplicates: true })
  if (error) throw error

  await admin
    .from('integrations')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', 'strava')

  return { connected: true, imported: rides.length }
}

/**
 * Import trips from Ride with GPS, with their per-point heart rate.
 *
 * Two requests per trip is unavoidable: the trips index deliberately omits
 * track_points, so the detail endpoint has to be fetched per trip. The window
 * is therefore bounded by MAX_TRIPS rather than by the size of the library.
 *
 * The trip → ride mapping lives in _shared/ridewithgps.ts, pure and tested
 * against the payload the API documents.
 */
async function syncRideWithGps(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  sinceDays: number,
) {
  const token = await validAccessToken(admin, userId, 'ridewithgps')
  if (!token) return { connected: false, imported: 0 }

  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }

  // The index is ordered by updated_at and cannot be filtered by date
  // server-side, so the window is applied here.
  const cutoffMs = Date.now() - sinceDays * 86400000
  // A ceiling on detail fetches, so a long library cannot turn one sync into
  // hundreds of requests against someone else's API.
  const MAX_TRIPS = 50

  const summaries: Array<Record<string, unknown>> = []
  for (let page = 1; page <= 5 && summaries.length < MAX_TRIPS; page += 1) {
    const listResponse = await fetch(
      `https://ridewithgps.com/api/v1/trips.json?page=${page}&page_size=50`,
      { headers },
    )
    if (!listResponse.ok) {
      throw new Error(
        `Ride with GPS trips failed (${listResponse.status}): ${await listResponse.text()}`,
      )
    }

    const body = await listResponse.json()
    const trips = Array.isArray(body?.trips) ? body.trips : []
    if (trips.length === 0) break

    let sawOlderThanWindow = false
    for (const trip of trips) {
      const departed = trip?.departed_at ? Date.parse(trip.departed_at) : NaN
      if (Number.isFinite(departed) && departed < cutoffMs) {
        sawOlderThanWindow = true
        continue
      }
      summaries.push(trip)
    }

    // Ordered by updated_at rather than departed_at, so an old trip edited
    // yesterday still appears near the top. Stop only once a page contained
    // something outside the window and there is no next page.
    if (sawOlderThanWindow || !body?.meta?.pagination?.next_page_url) break
  }

  const rides: Record<string, unknown>[] = []
  let skipped = 0

  for (const summary of summaries.slice(0, MAX_TRIPS)) {
    if (summary?.id == null) continue

    const detailResponse = await fetch(`https://ridewithgps.com/api/v1/trips/${summary.id}.json`, {
      headers,
    })
    // One unreadable trip must not abort the sync: a trip can answer 403 when
    // it belongs to a club ride the rider can no longer see.
    if (!detailResponse.ok) {
      skipped += 1
      continue
    }

    const ride = tripToRide((await detailResponse.json())?.trip, userId)
    if (ride) rides.push(ride)
    else skipped += 1
  }

  if (rides.length === 0) return { connected: true, imported: 0, skipped }

  // ignoreDuplicates so a later sync cannot wipe an RPE typed in by hand.
  const { error } = await admin
    .from('rides')
    .upsert(rides, { onConflict: 'user_id,source,external_id', ignoreDuplicates: true })
  if (error) throw error

  await admin
    .from('integrations')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', 'ridewithgps')

  // Reported because it is the reason this provider is here at all: a ride
  // without a heart-rate trace contributes nothing to time in zones or the
  // polarized audit, and the rider should be able to see that at a glance.
  const withHeartRate = rides.filter((r) =>
    trackHasHeartRate((r.track ?? []) as TrackPoint[]),
  ).length

  return { connected: true, imported: rides.length, withHeartRate, skipped }
}

async function syncFitbit(admin: ReturnType<typeof adminClient>, userId: string, sinceDays: number) {
  const token = await validAccessToken(admin, userId, 'fitbit')
  if (!token) return { connected: false, imported: 0 }

  // en_US makes Fitbit return pounds rather than kilograms.
  const headers = { Authorization: `Bearer ${token}`, 'Accept-Language': 'en_US' }
  const end = new Date().toISOString().slice(0, 10)
  const start = new Date(Date.now() - Math.min(sinceDays, 30) * 86400000).toISOString().slice(0, 10)

  const [hrRes, weightRes, sleepRes] = await Promise.all([
    fetch(`https://api.fitbit.com/1/user/-/activities/heart/date/${start}/${end}.json`, { headers }),
    fetch(`https://api.fitbit.com/1/user/-/body/log/weight/date/${start}/${end}.json`, { headers }),
    fetch(`https://api.fitbit.com/1.2/user/-/sleep/date/${start}/${end}.json`, { headers }),
  ])

  // Keyed by day so the three endpoints merge into one row per date.
  const byDate = new Map<string, { resting_hr?: number; weight_lbs?: number; body_fat_pct?: number }>()
  const touch = (date: string) => {
    if (!byDate.has(date)) byDate.set(date, {})
    return byDate.get(date)!
  }

  if (hrRes.ok) {
    const hr = await hrRes.json()
    for (const day of hr['activities-heart'] ?? []) {
      const resting = day.value?.restingHeartRate
      if (resting) touch(day.dateTime).resting_hr = Math.round(resting)
    }
  }

  if (weightRes.ok) {
    const body = await weightRes.json()
    for (const entry of body.weight ?? []) {
      const row = touch(entry.date)
      if (entry.weight) row.weight_lbs = Math.round(entry.weight * 10) / 10
      if (entry.fat) row.body_fat_pct = Math.round(entry.fat * 10) / 10
    }
  }

  const bodyRows = [...byDate.entries()]
    .filter(([, v]) => v.resting_hr != null || v.weight_lbs != null)
    .map(([measured_at, v]) => ({
      user_id: userId,
      source: 'fitbit',
      measured_at,
      resting_hr: v.resting_hr ?? null,
      weight_lbs: v.weight_lbs ?? null,
      body_fat_pct: v.body_fat_pct ?? null,
      // is_baseline is deliberately absent, not set to false. An upsert only
      // writes the columns it is given, so omitting it lets the column keep
      // whatever the rider chose. Sending `false` here re-wrote that choice on
      // every sync — the marker was set on 23 August and silently erased the
      // next time the data refreshed, taking every "vs baseline" comparison in
      // the study with it. A new row still starts false, from the column
      // default.
    }))

  if (bodyRows.length > 0) {
    const { error } = await admin
      .from('body_comp')
      .upsert(bodyRows, { onConflict: 'user_id,measured_at,source' })
    if (error) throw error
  }

  let sleepRows: Record<string, unknown>[] = []
  if (sleepRes.ok) {
    const sleep = await sleepRes.json()
    const byNight = new Map<string, number>()
    for (const record of sleep.sleep ?? []) {
      if (record.isMainSleep === false) continue
      const minutes = record.minutesAsleep ?? 0
      byNight.set(record.dateOfSleep, (byNight.get(record.dateOfSleep) ?? 0) + minutes)
    }
    sleepRows = [...byNight.entries()].map(([entry_date, minutes]) => ({
      user_id: userId,
      source: 'fitbit',
      entry_date,
      sleep_hrs: Math.round((minutes / 60) * 10) / 10,
    }))

    if (sleepRows.length > 0) {
      // ignoreDuplicates so a synced sleep figure never overwrites what you
      // actually wrote about how the ride felt.
      const { error } = await admin
        .from('journal_entries')
        .upsert(sleepRows, { onConflict: 'user_id,entry_date,source', ignoreDuplicates: true })
      if (error) throw error
    }
  }

  await admin
    .from('integrations')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', 'fitbit')

  return { connected: true, imported: bodyRows.length + sleepRows.length }
}


// ---------------------------------------------------------------------------
// Google Health
// ---------------------------------------------------------------------------

const GOOGLE_HEALTH_BASE = 'https://health.googleapis.com/v4'

/**
 * Data types this app reads.
 *
 * Note the two spellings: the URL path wants kebab-case (`body-fat`) while the
 * filter expression wants snake_case (`body_fat`). Getting that backwards
 * returns a 400 that reads like an auth problem.
 *
 * Confirmed against a live account with the `probe` action rather than assumed:
 * `weight` and `body-fat` are correct, and `resting-heart-rate` is not a data
 * type at all — Google rejects it with INVALID_PARENT_DATA_TYPE_COLLECTION. The
 * `discover` action finds the real name instead of guessing a second time.
 */
const GOOGLE_TYPES = {
  weight: { path: 'weight', field: 'weight', timeField: 'sample_time.physical_time' },
  bodyFat: { path: 'body-fat', field: 'body_fat', timeField: 'sample_time.physical_time' },
  sleep: { path: 'sleep', field: 'sleep', timeField: 'interval.civil_end_time' },
  restingHeartRate: { path: 'daily-resting-heart-rate', field: 'daily_resting_heart_rate', timeField: 'date' },
  // `daily-heart-rate-variability` imported nothing for weeks. A discovery run
  // against the live account showed why: the type that answers is the
  // per-sample `heart-rate-variability`, filtered on sample_time like weight
  // and body fat rather than on a `date` field. Same trap as
  // `resting-heart-rate`, which is not a data type at all — the plausible name
  // and the real one are rarely the same here.
  hrv: { path: 'heart-rate-variability', field: 'heart_rate_variability', timeField: 'sample_time.physical_time' },
  vo2Max: { path: 'vo2-max', field: 'vo2_max', timeField: 'sample_time.physical_time' },
} as const

const KG_TO_LBS = 2.20462

/** The slice of a Google Health list response this app actually reads. */
interface GoogleListResponse {
  dataPoints?: unknown[]
  nextPageToken?: string
  [key: string]: unknown
}

async function googleGet(token: string, path: string, params: Record<string, string>, retries = 2) {
  const url = new URL(`${GOOGLE_HEALTH_BASE}/users/me/dataTypes/${path}/dataPoints`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })

      // If rate limited or server overloaded, retry with exponential backoff
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 600))
        continue
      }

      const text = await res.text()
      let body: GoogleListResponse
      try {
        body = JSON.parse(text)
      } catch {
        body = { raw: text.slice(0, 500) }
      }
      return { ok: res.ok, status: res.status, body }
    } catch (error) {
      if (attempt >= retries) throw error
      await new Promise((r) => setTimeout(r, (attempt + 1) * 600))
    }
  }
  return { ok: false, status: 500, body: { error: 'Exhausted retries' } }
}

/**
 * Pull every page for one data type.
 *
 * Sleep and exercise cap pages at 25 regardless of what is asked for, so
 * pagination is not optional even over a short window.
 */
async function googleListAll(token: string, path: string, filter: string, cap = 10) {
  const points: unknown[] = []
  let pageToken: string | undefined
  let pages = 0

  do {
    const params: Record<string, string> = { filter, page_size: '100' }
    if (pageToken) params.page_token = pageToken

    const { ok, status, body } = await googleGet(token, path, params)
    if (!ok) throw new Error(`Google Health ${path} failed (${status}): ${JSON.stringify(body).slice(0, 300)}`)

    for (const p of body.dataPoints ?? []) points.push(p)
    pageToken = body.nextPageToken
    pages += 1
  } while (pageToken && pages < cap)

  return points
}

/** First finite number found under any of the given keys, at any depth. */
function findNumber(value: unknown, keys: string[]): number | null {
  if (value == null || typeof value !== 'object') return null
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (keys.includes(k)) {
      if (typeof v === 'number' && Number.isFinite(v)) return v
      if (typeof v === 'string' && v.trim() !== '') {
        const num = Number(v)
        if (Number.isFinite(num)) return num
      }
    }
    const nested = findNumber(v, keys)
    if (nested !== null) return nested
  }
  return null
}

/** First ISO-ish timestamp found under any of the given keys, at any depth. */
function findTime(value: unknown, keys: string[]): string | null {
  if (value == null || typeof value !== 'object') return null
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (keys.includes(k) && typeof v === 'string' && v.length >= 10) return v
    const nested = findTime(v, keys)
    if (nested !== null) return nested
  }
  return null
}

const dayOf = (iso: string | null) => (iso ? iso.slice(0, 10) : null)

/**
 * The calendar date a measurement belongs to, in the rider's own local time.
 *
 * Every point carries both a UTC `physicalTime` and a `civilTime` with the
 * local date already broken out. Slicing the UTC string files an evening
 * measurement under the following day — the same mistake the app itself made
 * before `recordDate` was introduced. The civil date is authoritative.
 */
function localDayOf(point: unknown): string | null {
  const civil = findCivilDate(point)
  if (civil) return civil
  return dayOf(findTime(point, ['physicalTime', 'physical_time', 'startTime', 'endTime']))
}

/** Format a `civilTime.date` object as YYYY-MM-DD, at any depth. */
function findCivilDate(value: unknown): string | null {
  if (value == null || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>

  const date = obj.date as Record<string, unknown> | undefined
  if (
    date &&
    typeof date.year === 'number' &&
    typeof date.month === 'number' &&
    typeof date.day === 'number'
  ) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.year}-${pad(date.month)}-${pad(date.day)}`
  }

  for (const v of Object.values(obj)) {
    const nested = findCivilDate(v)
    if (nested !== null) return nested
  }
  return null
}

async function syncGoogleHealth(admin: ReturnType<typeof adminClient>, userId: string, sinceDays: number) {
  const token = await validAccessToken(admin, userId, 'google_health')
  if (!token) return { connected: false, imported: 0 }

  const since = new Date(Date.now() - sinceDays * 86400000).toISOString()
  const byDate = new Map<string, Record<string, number>>()
  const touch = (d: string) => {
    if (!byDate.has(d)) byDate.set(d, {})
    return byDate.get(d)!
  }
  const notes: string[] = []

  // Each type is fetched independently: one unsupported identifier should not
  // cost the others, and the note explains what was skipped.
  for (const [key, cfg] of Object.entries(GOOGLE_TYPES)) {
    if (key === 'sleep') continue
    try {
      const timeStr = key === 'restingHeartRate' ? since.slice(0, 10) : since
      const filter = `${cfg.field}.${cfg.timeField} >= "${timeStr}"`
      const points = await googleListAll(token, cfg.path, filter)

      for (const point of points) {
        const day = localDayOf(point)
        if (!day) continue
        const row = touch(day)

        if (key === 'weight') {
          // Confirmed by the probe: Google reports mass as `weightGrams`.
          // Kilograms and pounds are kept as fallbacks in case another source
          // reports differently, but grams is what a Withings scale sends.
          const grams = findNumber(point, ['weightGrams', 'weight_grams', 'grams'])
          const kg = findNumber(point, ['kilograms', 'kg'])
          const lbs = findNumber(point, ['pounds', 'lbs'])
          if (grams !== null) row.weight_lbs = Math.round((grams / 1000) * KG_TO_LBS * 10) / 10
          else if (kg !== null) row.weight_lbs = Math.round(kg * KG_TO_LBS * 10) / 10
          else if (lbs !== null) row.weight_lbs = Math.round(lbs * 10) / 10
        } else if (key === 'bodyFat') {
          // Same trap as HRV and VO2 max: the plausible field name and the real
          // one are rarely the same, so several are tried. A Withings Body
          // scale is the source here, and body fat is the number the case study
          // actually turns on — weight can sit flat for four months while
          // composition moves underneath it.
          const raw = findNumber(point, [
            'bodyFatPercentage',
            'body_fat_percentage',
            'percentage',
            'percent',
          ])

          if (raw !== null) {
            // Google may report a ratio (0.18) or a percentage (18). Nothing
            // alive has 0.18% body fat, so anything at or under 1 is a ratio.
            const pct = raw <= 1 ? raw * 100 : raw
            // 3% is below the essential-fat floor and 70% is past the recorded
            // maximum, so a value outside that came from the wrong field. Drop
            // it with a note rather than chart it as a body composition result.
            if (pct >= 3 && pct <= 70) row.body_fat_pct = Math.round(pct * 10) / 10
            else {
              notes.push(
                `body fat: ignored an out-of-range value (${raw}) — field mapping may be wrong`,
              )
            }
          }
        } else if (key === 'restingHeartRate') {
          const bpm = findNumber(point, ['beatsPerMinute', 'beats_per_minute', 'bpm'])
          if (bpm !== null) row.resting_hr = Math.round(bpm)
        } else if (key === 'hrv') {
          // Read off a live sample rather than guessed a third time. Google
          // spells it out in full — none of the plausible abbreviations tried
          // before were close — and it is rMSSD, the standard short-term HRV
          // measure. The shorter names stay as fallbacks for other platforms.
          // Deliberately no generic `value` key: findNumber searches nested
          // objects, and a bare `value` would happily match something that is
          // not a duration at all.
          const ms = findNumber(point, [
            'rootMeanSquareOfSuccessiveDifferencesMilliseconds',
            'root_mean_square_of_successive_differences_milliseconds',
            'averageHeartRateVariabilityMilliseconds',
            'heartRateVariabilityMilliseconds',
            'rmssdMilliseconds',
            'rmssd',
          ])
          // A plausible physiological range, so a misread field is dropped
          // rather than charted. Adult resting rMSSD runs roughly 10–200 ms.
          if (ms !== null && ms >= 5 && ms <= 400) row.hrv_ms = Math.round(ms)
          else if (ms !== null) {
            notes.push(`hrv: ignored an out-of-range value (${ms}) — field mapping may be wrong`)
          }
        } else if (key === 'vo2Max') {
          // The field name is not documented, so several are tried. The range
          // check is what makes that safe: 20–90 ml/kg/min spans untrained to
          // elite, so a number picked out of the wrong field is dropped with a
          // note rather than charted as a fitness result.
          const value = findNumber(point, [
            'vo2MaxMillilitersPerMinutePerKilogram',
            'vo2_max_milliliters_per_minute_per_kilogram',
            'millilitersPerMinutePerKilogram',
            'milliliters_per_minute_per_kilogram',
            'vo2Max',
            'vo2_max',
          ])
          if (value !== null && value >= 20 && value <= 90) row.vo2_max = Math.round(value * 10) / 10
          else if (value !== null) {
            notes.push(`vo2 max: ignored an out-of-range value (${value}) — field mapping may be wrong`)
          }
        }
      }
    } catch (error) {
      notes.push(`${cfg.path}: ${String((error as Error).message ?? error).slice(0, 160)}`)
    }
  }

  const bodyRows = [...byDate.entries()]
    .filter(([, v]) => Object.keys(v).length > 0)
    .map(([measured_at, v]) => ({
      user_id: userId,
      source: 'google_health',
      measured_at,
      weight_lbs: v.weight_lbs ?? null,
      body_fat_pct: v.body_fat_pct ?? null,
      resting_hr: v.resting_hr ?? null,
      hrv_ms: v.hrv_ms ?? null,
      vo2_max: v.vo2_max ?? null,
      // Omitted rather than set — see the note in the Fitbit sync above. An
      // upsert writes only the columns present, so leaving this out preserves
      // the rider's chosen baseline instead of clearing it on every run.
    }))

  if (bodyRows.length > 0) {
    const { error } = await admin
      .from('body_comp')
      .upsert(bodyRows, { onConflict: 'user_id,measured_at,source' })
    if (error) throw error
  }

  // Sleep, into the journal.
  let sleepRows: Record<string, unknown>[] = []
  try {
    const filter = `sleep.${GOOGLE_TYPES.sleep.timeField} >= "${since.slice(0, 10)}"`
    const points = await googleListAll(token, 'sleep', filter)
    const byNight = new Map<string, number>()

    for (const point of points) {
      const end = findTime(point, ['civilEndTime', 'civil_end_time', 'endTime'])
      const day = dayOf(end)
      if (!day) continue
      // Duration may be reported as seconds or minutes depending on the field.
      const minutes =
        findNumber(point, ['minutesAsleep', 'minutes_asleep']) ??
        (findNumber(point, ['sleepDurationSeconds', 'durationSeconds']) ?? 0) / 60
      if (minutes > 0) byNight.set(day, Math.max(byNight.get(day) ?? 0, minutes))
    }

    sleepRows = [...byNight.entries()].map(([entry_date, minutes]) => ({
      user_id: userId,
      source: 'google_health',
      entry_date,
      sleep_hrs: Math.round((minutes / 60) * 10) / 10,
    }))

    if (sleepRows.length > 0) {
      // ignoreDuplicates so a synced figure never overwrites what you wrote.
      const { error } = await admin
        .from('journal_entries')
        .upsert(sleepRows, { onConflict: 'user_id,entry_date,source', ignoreDuplicates: true })
      if (error) throw error
    }
  } catch (error) {
    notes.push(`sleep: ${String((error as Error).message ?? error).slice(0, 160)}`)
  }

  // Ride heart rate, matched onto tracks that have none. Runs last so a
  // failure here cannot cost the body and sleep rows already written.
  let hrFill = { ridesUpdated: 0, pointsMatched: 0 }
  try {
    hrFill = await backfillRideHeartRate(admin, userId, token, sinceDays, notes)
  } catch (error) {
    notes.push(`heart rate: ${String((error as Error).message ?? error).slice(0, 160)}`)
  }

  await admin
    .from('integrations')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', 'google_health')

  return {
    connected: true,
    imported: bodyRows.length + sleepRows.length,
    ridesGivenHeartRate: hrFill.ridesUpdated || undefined,
    notes: notes.length ? notes : undefined,
  }
}

/** How far a heart-rate sample may sit from a track point and still match it. */
const MAX_MATCH_MS = 90_000

/**
 * Fill in heart rate on rides that were recorded without it.
 *
 * Google Health carries per-sample heart rate from a Fitbit with real
 * timestamps, and a GPS track is a list of positions with timestamps. Matching
 * the two by time turns a ride logged as distance-and-duration into one that
 * can be analysed physiologically — time in zones, beats per mile, training
 * impulse — retroactively, with no strap and without re-riding it.
 *
 * Rules that keep this honest:
 *
 *   - A track that already carries heart rate is never touched. A chest strap
 *     measures at the chest every second; this is a wrist reading interpolated
 *     onto a route, and the better data must always win.
 *   - A track point with no sample within MAX_MATCH_MS keeps its null. Wrist
 *     heart rate is sampled sparsely at rest, and stretching one reading across
 *     a ten-minute gap would invent a plateau that never happened.
 *   - Ride-level avg_hr and max_hr are filled only when empty, so a figure
 *     typed from a head unit is never overwritten by a derived one.
 */
async function backfillRideHeartRate(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  token: string,
  sinceDays: number,
  notes: string[],
) {
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString()

  const { data: rides } = await admin
    .from('rides')
    .select('id, ridden_at, track, avg_hr, max_hr')
    .eq('user_id', userId)
    .gte('ridden_at', since)
    .not('track', 'is', null)

  let ridesUpdated = 0
  let pointsMatched = 0

  for (const ride of rides ?? []) {
    const track = ride.track as unknown[]
    if (!Array.isArray(track) || track.length < 2) continue

    // Already has heart rate from a strap or a GPX file — leave it alone.
    if (track.some((p) => Array.isArray(p) && p[4] != null)) continue

    const times = track
      .map((p) => (Array.isArray(p) ? Number(p[2]) : NaN))
      .filter((t) => Number.isFinite(t) && t > 0)
    if (times.length < 2) continue

    const start = Math.min(...times)
    const end = Math.max(...times)

    const windowStart = start - MAX_MATCH_MS
    const windowEnd = end + MAX_MATCH_MS
    const day = ride.ridden_at.slice(0, 10)

    try {
      // Only a lower bound. An upper bound needs a second clause joined with
      // AND, and this API's support for that is undocumented — depending on it
      // once already turned the whole pass into a silent no-op.
      const filter = `heart_rate.sample_time.physical_time >= "${new Date(windowStart).toISOString()}"`

      // Paged by hand rather than through googleListAll so it can stop early.
      // The ordering of results is not documented either — a 30-day query
      // returns samples from minutes ago, which suggests newest-first — so
      // rather than assume, this stops when a whole page adds nothing inside
      // the window, which holds whichever way the API sorts.
      const samples: { t: number; bpm: number }[] = []
      let pageToken: string | undefined
      let pages = 0
      let scanned = 0

      do {
        const params: Record<string, string> = { filter, page_size: '100' }
        if (pageToken) params.page_token = pageToken

        const { ok, status, body } = await googleGet(token, 'heart-rate', params)
        if (!ok) {
          throw new Error(`heart-rate list failed (${status}): ${JSON.stringify(body).slice(0, 200)}`)
        }

        const before = samples.length
        for (const point of body.dataPoints ?? []) {
          const iso = findTime(point, ['physicalTime', 'physical_time'])
          const bpm = findNumber(point, ['beatsPerMinute', 'beats_per_minute', 'bpm'])
          // Google sends beatsPerMinute as a string; findNumber coerces it.
          if (!iso || bpm === null || bpm <= 0) continue
          const t = new Date(iso).getTime()
          if (!Number.isFinite(t)) continue
          scanned += 1
          if (t >= windowStart && t <= windowEnd) samples.push({ t, bpm })
        }

        pageToken = body.nextPageToken
        pages += 1

        // Once a full page contributes nothing and something was already
        // found, the pages have moved past the ride in whichever direction
        // they run.
        if (samples.length === before && samples.length > 0) break
      } while (pageToken && pages < 60)

      if (samples.length === 0) {
        notes.push(
          `heart rate: scanned ${scanned} samples over ${pages} pages, none inside the ${day} ride window`,
        )
        continue
      }

      samples.sort((a, b) => a.t - b.t)

      // Walking pointer rather than a search per point: both lists are sorted,
      // so one pass is enough even for a long ride against dense samples.
      let cursor = 0
      let matched = 0
      const filled = track.map((p) => {
        if (!Array.isArray(p)) return p
        const t = Number(p[2])
        if (!Number.isFinite(t) || t <= 0) return p

        while (cursor < samples.length - 1 && samples[cursor + 1].t <= t) cursor += 1

        // The nearer of the two samples bracketing this point.
        const before = samples[cursor]
        const after = samples[Math.min(cursor + 1, samples.length - 1)]
        const nearest =
          Math.abs(before.t - t) <= Math.abs(after.t - t) ? before : after

        if (Math.abs(nearest.t - t) > MAX_MATCH_MS) return p
        matched += 1
        const next = [...p]
        next[4] = Math.round(nearest.bpm)
        return next
      })

      if (matched === 0) {
        notes.push(`heart rate: ${samples.length} samples near the ${day} ride, but none within 90s of a track point`)
        continue
      }

      const matchedBpm = filled
        .map((p) => (Array.isArray(p) ? Number(p[4]) : NaN))
        .filter((n) => Number.isFinite(n) && n > 0)

      const update: Record<string, unknown> = { track: filled }
      if (ride.avg_hr == null && matchedBpm.length > 0) {
        update.avg_hr = Math.round(matchedBpm.reduce((s, n) => s + n, 0) / matchedBpm.length)
      }
      if (ride.max_hr == null && matchedBpm.length > 0) {
        update.max_hr = Math.max(...matchedBpm)
      }

      const { error } = await admin.from('rides').update(update).eq('id', ride.id)
      if (error) throw error

      ridesUpdated += 1
      pointsMatched += matched
      notes.push(
        `heart rate: filled ${matched} of ${track.length} points on the ${day} ride from ${samples.length} samples`,
      )
    } catch (error) {
      notes.push(`heart rate (${day}): ${String((error as Error).message ?? error).slice(0, 200)}`)
    }
  }

  return { ridesUpdated, pointsMatched }
}

/**
 * Return one raw data point per type, untouched.
 *
 * The docs name the response shape for body fat but not for weight, resting
 * heart rate, or sleep, and units are unstated. Rather than ship a guess, this
 * shows what the account actually returns so the mapping can be confirmed.
 */
async function probeGoogleHealth(admin: ReturnType<typeof adminClient>, userId: string) {
  const token = await validAccessToken(admin, userId, 'google_health')
  if (!token) return { connected: false }

  const since = new Date(Date.now() - 90 * 86400000).toISOString()
  const out: Record<string, unknown> = {}

  for (const [key, cfg] of Object.entries(GOOGLE_TYPES)) {
    const time = key === 'sleep' ? since.slice(0, 10) : since
    const filter = `${cfg.field}.${cfg.timeField} >= "${time}"`
    const { ok, status, body } = await googleGet(token, cfg.path, { filter, page_size: '1' })
    out[cfg.path] = ok
      ? { status, sample: (body.dataPoints ?? [])[0] ?? 'no data in the last 90 days' }
      : { status, error: body }
  }

  return { connected: true, types: out }
}


/**
 * Find which data type identifiers this account actually supports.
 *
 * `resting-heart-rate` turned out not to exist, and the docs do not publish a
 * complete list of identifiers. Rather than guess a second time, this asks the
 * API: first for the data type collection itself, then by trying plausible
 * names and reporting which are accepted. A 400 naming
 * INVALID_PARENT_DATA_TYPE_COLLECTION means the identifier is wrong; a 200
 * means it is real, whether or not the account has data for it. A 403 means the
 * type exists but its OAuth scope was never granted.
 */
const CANDIDATE_TYPES = [
  'heart-rate',
  'daily-resting-heart-rate',
  'resting-heart-rate-daily',
  'heart-rate-summary',
  'daily-heart-rate',
  'cardio-fitness-score',
  'vo2-max',
  'daily-vo2-max',
  'run-vo2-max',
  'heart-rate-variability',
  'breathing-rate',
  'respiratory-rate',
  'steps',
  'height',
  'bmi',
  'active-minutes',
  'active-zone-minutes',
  'total-calories',
]

async function discoverGoogleTypes(admin: ReturnType<typeof adminClient>, userId: string) {
  const token = await validAccessToken(admin, userId, 'google_health')
  if (!token) return { connected: false }

  // There is no data type catalogue on this API: /users/me/dataTypes answers
  // with Google's 404 HTML page. That was worth checking once and is not worth
  // requesting on every run, so the candidate sweep below is the whole method.
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const valid: string[] = []
  const invalid: string[] = []
  // The raw first data point for each working type. Knowing a type exists is
  // only half the answer: Google documents neither its units nor its value
  // field names, so weight arrives as `weightGrams` and anything mapped by
  // guesswork imports silently as nothing. The sample makes the mapping
  // verifiable instead of a second guess.
  const samples: Record<string, unknown> = {}

  for (const path of CANDIDATE_TYPES) {
    // The filter field is the snake_case form of the kebab-case path.
    const field = path.replace(/-/g, '_')
    const { ok, status, body } = await googleGet(token, path, {
      filter: `${field}.sample_time.physical_time >= "${since}"`,
      page_size: '1',
    })

    if (ok) {
      valid.push(`${path} (200)`)
      const points = (body as GoogleListResponse)?.dataPoints
      samples[path] =
        Array.isArray(points) && points.length > 0
          ? points[0]
          : 'type works, but no data points in the last 30 days'
      continue
    }

    // Both an unknown data type and a wrong filter field return 400, so the
    // status alone cannot separate them. Only the unsupported-type reason
    // means the identifier itself is wrong; any other 400 proves the type
    // exists and it was the filter that was rejected.
    const detail = JSON.stringify(body)
    if (detail.includes('INVALID_PARENT_DATA_TYPE_COLLECTION')) {
      invalid.push(path)
    } else if (status === 403) {
      // Distinguishing this from missing data matters: a 403 is a permission to
      // request, not an absence to work around.
      valid.push(`${path} (403, exists but this scope was not granted)`)
    } else {
      valid.push(`${path} (${status}, type exists — filter rejected)`)
    }
  }

  return { connected: true, valid, invalid, samples }
}

/**
 * The providers that can be synced and disconnected, and what syncs each.
 *
 * One table rather than a chain of ternaries and a separate hand-written
 * allowlist: those two drifted apart before — oauth-start knew about
 * google_health while the disconnect branch still rejected it — and a provider
 * added to this map is understood by every path at once.
 */
const SYNCS: Record<
  Provider,
  (admin: ReturnType<typeof adminClient>, userId: string, days: number) => Promise<unknown>
> = {
  strava: syncStrava,
  fitbit: syncFitbit,
  google_health: syncGoogleHealth,
  ridewithgps: syncRideWithGps,
}

const SYNCABLE = Object.keys(SYNCS) as Provider[]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const userId = await userFromRequest(req)
    if (!userId) return json({ error: 'Not signed in.' }, 401)

    const { action, provider, since_days } = await req.json().catch(() => ({}))
    const admin = adminClient()

    if (action === 'status') {
      // Deliberately never selects the token columns.
      const { data } = await admin
        .from('integrations')
        .select('provider, connected_at, last_synced_at, athlete_id')
        .eq('user_id', userId)
      return json({ integrations: data ?? [] })
    }

    if (action === 'probe') {
      return json(await probeGoogleHealth(admin, userId))
    }

    if (action === 'discover') {
      return json(await discoverGoogleTypes(admin, userId))
    }

    if (action === 'disconnect') {
      if (!SYNCABLE.includes(provider as Provider)) {
        return json({ error: `provider must be one of: ${SYNCABLE.join(', ')}.` }, 400)
      }
      await admin
        .from('integrations')
        .delete()
        .eq('user_id', userId)
        .eq('provider', provider as Provider)
      return json({ ok: true })
    }

    if (action === 'sync') {
      const days = Math.min(Math.max(Number(since_days) || 30, 1), 365)
      const results: Record<string, unknown> = {}
      const errors: Record<string, string> = {}

      // One failing provider must not prevent the others from syncing.
      for (const p of provider ? [provider] : SYNCABLE) {
        try {
          const sync = SYNCS[p as Provider]
          if (!sync) {
            errors[p] = `Unknown provider: ${p}`
            continue
          }
          results[p] = await sync(admin, userId, days)
        } catch (error) {
          errors[p] = String((error as Error).message ?? error)
        }
      }

      return json({ results, errors: Object.keys(errors).length ? errors : undefined })
    }

    return json({ error: 'action must be "status", "sync", "probe", "discover", or "disconnect".' }, 400)
  } catch (error) {
    return json({ error: String((error as Error).message ?? error) }, 500)
  }
})
