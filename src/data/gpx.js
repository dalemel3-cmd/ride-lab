/**
 * GPX parsing.
 *
 * The free route in and out of every platform. Strava, Garmin, Wahoo and
 * essentially every head unit will export a ride as GPX without any developer
 * account, API key, or subscription — which matters, because Strava's API now
 * requires a paid plan and Fitbit's is being retired.
 *
 * Parsed with the browser's own DOMParser: GPX is XML, and pulling in an XML
 * library to read a handful of tags would be a dependency for nothing.
 */

import { haversineMiles } from './metrics.js'
import { elevationGainMeters } from './track.js'

const METERS_TO_FEET = 3.28084

/**
 * Heart rate lives in a namespaced extension rather than the GPX core, and
 * different exporters use different prefixes for it. Matching on local name
 * avoids caring which one produced the file.
 */
function heartRateFrom(pointEl) {
  const extensions = pointEl.getElementsByTagName('extensions')[0]
  if (!extensions) return null

  for (const el of extensions.getElementsByTagName('*')) {
    // gpxtpx:hr, ns3:hr, hr — all end in "hr".
    const name = (el.localName ?? el.nodeName.split(':').pop() ?? '').toLowerCase()
    if (name === 'hr') {
      const value = Number(el.textContent)
      if (Number.isFinite(value) && value > 0) return value
    }
  }
  return null
}

/**
 * Total climb, ignoring GPS noise.
 *
 * Delegates to the shared implementation rather than keeping a second copy.
 * The copy that used to live here rejected any step under a metre, which threw
 * away entire climbs on files that log elevation every few seconds — see the
 * note in track.js.
 */
function elevationGainFeet(elevations) {
  const gain = elevationGainMeters(elevations.map((ele) => [0, 0, 0, ele, null]))
  return gain === null ? null : Math.round(gain * METERS_TO_FEET)
}

/**
 * Map a GPX activity type onto this app's surface vocabulary.
 *
 * Strava writes `<type>gravel_biking</type>` and similar into the track. Reading
 * it matters more than it looks: surface is what makes beats-per-mile
 * comparable, because gravel and singletrack cost far more per mile than
 * pavement at identical fitness. Importing a gravel route as paved-trail pools
 * it with the greenway rides and makes the rider look slower than they are.
 *
 * Returns null for anything unrecognised, so the caller falls back to its own
 * default rather than this guessing.
 */
function surfaceFromType(type) {
  const t = (type ?? '').toLowerCase()
  if (!t) return null
  if (t.includes('gravel')) return 'gravel'
  if (t.includes('mountain') || t.includes('mtb')) return 'singletrack'
  if (t.includes('road') || t.includes('cycling') || t.includes('biking')) return 'road'
  return null
}

/**
 * Parse a GPX document into the fields a ride needs.
 *
 * Returns null when the file contains no usable track. Throws only on input
 * that is not XML at all.
 */
export function parseGpx(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')

  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('That file is not valid GPX.')
  }

  const points = [...doc.getElementsByTagName('trkpt')]
  if (points.length < 2) return null

  const track = []
  const elevations = []
  const heartRates = []
  let firstTime = null
  let lastTime = null

  for (const point of points) {
    const lat = Number(point.getAttribute('lat'))
    const lon = Number(point.getAttribute('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

    const timeText = point.getElementsByTagName('time')[0]?.textContent
    const time = timeText ? new Date(timeText).getTime() : null
    if (time && !Number.isNaN(time)) {
      if (firstTime === null) firstTime = time
      lastTime = time
    }

    const eleRaw = point.getElementsByTagName('ele')[0]?.textContent
    const eleNum = eleRaw === undefined || eleRaw === '' ? NaN : Number(eleRaw)
    const ele = Number.isFinite(eleNum) ? eleNum : null
    if (ele !== null) elevations.push(ele)

    const hr = heartRateFrom(point)
    if (hr !== null) heartRates.push(hr)

    // Elevation (metres) and heart rate ride along on each point, which is what
    // makes per-segment heart rate and climb profiles possible at all. Storing
    // only the ride-wide averages, as this did originally, meant any stretch
    // shorter than a whole ride could never be measured — only estimated from
    // figures that describe something else.
    track.push([lat, lon, time ?? 0, ele, hr])
  }

  if (track.length < 2) return null

  let distance = 0
  for (let i = 1; i < track.length; i += 1) {
    distance += haversineMiles(track[i - 1], track[i])
  }

  // Prefer the track's own name; GPX exports usually carry the activity title.
  const name =
    doc.getElementsByTagName('trk')[0]?.getElementsByTagName('name')[0]?.textContent?.trim() ||
    doc.getElementsByTagName('metadata')[0]?.getElementsByTagName('name')[0]?.textContent?.trim() ||
    null

  const durationMin =
    firstTime !== null && lastTime !== null && lastTime > firstTime
      ? Math.round(((lastTime - firstTime) / 60000) * 10) / 10
      : null

  // Both are needed by the returned object. Removing the average while leaving
  // the reference in place made parseGpx throw a ReferenceError on every file,
  // which lint does not catch and only a test run reveals.
  const avgHr = heartRates.length
    ? Math.round(heartRates.reduce((sum, hr) => sum + hr, 0) / heartRates.length)
    : null

  const maxHr = heartRates.length
    ? heartRates.reduce((max, hr) => (hr > max ? hr : max), 0)
    : null

  // Downsample track for local storage if over 1000 points (keeps shape, prevents quota overflow)
  let savedTrack = track
  if (track.length > 1000) {
    const step = Math.ceil(track.length / 1000)
    savedTrack = track.filter((_, idx) => idx === 0 || idx === track.length - 1 || idx % step === 0)
  }

  return {
    name,
    // Falls back to now so an export stripped of timestamps still imports.
    startedAt: firstTime !== null ? new Date(firstTime).toISOString() : null,
    track: savedTrack,
    distanceMi: Math.round(distance * 100) / 100,
    durationMin,
    elevationFt: elevations.length > 1 ? elevationGainFeet(elevations) : null,
    avgHr,
    maxHr,
    pointCount: track.length,
    hasHeartRate: heartRates.length > 0,
    surface: surfaceFromType(
      doc.getElementsByTagName('trk')[0]?.getElementsByTagName('type')[0]?.textContent,
    ),
    // A planned route carries positions and elevation but no timestamps. That
    // distinction decides whether a file is something you rode or something you
    // intend to ride, and the two must not be logged the same way.
    isPlannedRoute: firstTime === null,
  }
}
