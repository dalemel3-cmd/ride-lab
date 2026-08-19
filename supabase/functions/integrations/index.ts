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
      // Never auto-set: the baseline is a deliberate choice about when the
      // study starts, not whichever day happened to sync first.
      is_baseline: false,
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
 * `weight` and `resting-heart-rate` are the identifiers the docs imply but do
 * not state outright for these two metrics, so a mismatch is possible — the
 * `probe` action exists to check them against a live account rather than
 * shipping a guess as if it were verified.
 */
const GOOGLE_TYPES = {
  weight: { path: 'weight', field: 'weight', timeField: 'sample_time.physical_time' },
  bodyFat: { path: 'body-fat', field: 'body_fat', timeField: 'sample_time.physical_time' },
  restingHr: { path: 'resting-heart-rate', field: 'resting_heart_rate', timeField: 'sample_time.physical_time' },
  sleep: { path: 'sleep', field: 'sleep', timeField: 'interval.civil_end_time' },
} as const

const KG_TO_LBS = 2.20462

/** The slice of a Google Health list response this app actually reads. */
interface GoogleListResponse {
  dataPoints?: unknown[]
  nextPageToken?: string
  [key: string]: unknown
}

async function googleGet(token: string, path: string, params: Record<string, string>) {
  const url = new URL(`${GOOGLE_HEALTH_BASE}/users/me/dataTypes/${path}/dataPoints`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  const text = await res.text()
  let body: GoogleListResponse
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text.slice(0, 500) }
  }
  return { ok: res.ok, status: res.status, body }
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
    if (keys.includes(k) && typeof v === 'number' && Number.isFinite(v)) return v
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
      const filter = `${cfg.field}.${cfg.timeField} >= "${since}"`
      const points = await googleListAll(token, cfg.path, filter)

      for (const point of points) {
        const time = findTime(point, ['physicalTime', 'physical_time', 'startTime', 'endTime'])
        const day = dayOf(time)
        if (!day) continue
        const row = touch(day)

        if (key === 'weight') {
          // Google reports mass in kilograms; the app stores pounds.
          const kg = findNumber(point, ['kilograms', 'kg'])
          const lbs = findNumber(point, ['pounds', 'lbs'])
          if (kg !== null) row.weight_lbs = Math.round(kg * KG_TO_LBS * 10) / 10
          else if (lbs !== null) row.weight_lbs = Math.round(lbs * 10) / 10
        } else if (key === 'bodyFat') {
          const pct = findNumber(point, ['percentage', 'percent'])
          if (pct !== null) row.body_fat_pct = Math.round(pct * 10) / 10
        } else if (key === 'restingHr') {
          const bpm = findNumber(point, ['bpm', 'beatsPerMinute', 'beats_per_minute', 'value'])
          if (bpm !== null) row.resting_hr = Math.round(bpm)
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
      // Never automatic: which day starts the study is a decision.
      is_baseline: false,
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

  await admin
    .from('integrations')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', 'google_health')

  return {
    connected: true,
    imported: bodyRows.length + sleepRows.length,
    notes: notes.length ? notes : undefined,
  }
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

    if (action === 'disconnect') {
      if (provider !== 'strava' && provider !== 'fitbit' && provider !== 'google_health') {
        return json({ error: 'provider must be "strava", "fitbit", or "google_health".' }, 400)
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

      // One failing provider must not prevent the other from syncing.
      for (const p of provider ? [provider] : ['strava', 'fitbit', 'google_health']) {
        try {
          results[p] =
            p === 'strava'
              ? await syncStrava(admin, userId, days)
              : p === 'fitbit'
                ? await syncFitbit(admin, userId, days)
                : await syncGoogleHealth(admin, userId, days)
        } catch (error) {
          errors[p] = String((error as Error).message ?? error)
        }
      }

      return json({ results, errors: Object.keys(errors).length ? errors : undefined })
    }

    return json({ error: 'action must be "status", "sync", "probe", or "disconnect".' }, 400)
  } catch (error) {
    return json({ error: String((error as Error).message ?? error) }, 500)
  }
})
