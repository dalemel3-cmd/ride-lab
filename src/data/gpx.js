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
 * Barometric and GPS elevation both jitter by a metre or two at rest. Summing
 * every positive change would accumulate hundreds of phantom feet over a long
 * ride, so small changes are treated as noise rather than climbing.
 */
function elevationGainFeet(elevations) {
  const NOISE_THRESHOLD_M = 1
  let gain = 0
  for (let i = 1; i < elevations.length; i += 1) {
    const delta = elevations[i] - elevations[i - 1]
    if (delta > NOISE_THRESHOLD_M) gain += delta
  }
  return Math.round(gain * METERS_TO_FEET)
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

    track.push([lat, lon, time ?? 0])

    const ele = Number(point.getElementsByTagName('ele')[0]?.textContent)
    if (Number.isFinite(ele)) elevations.push(ele)

    const hr = heartRateFrom(point)
    if (hr !== null) heartRates.push(hr)
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

  const avgHr = heartRates.length
    ? Math.round(heartRates.reduce((sum, n) => sum + n, 0) / heartRates.length)
    : null

  return {
    name,
    // Falls back to now so an export stripped of timestamps still imports.
    startedAt: firstTime !== null ? new Date(firstTime).toISOString() : null,
    track,
    distanceMi: Math.round(distance * 100) / 100,
    durationMin,
    elevationFt: elevations.length > 1 ? elevationGainFeet(elevations) : null,
    avgHr,
    maxHr: heartRates.length ? Math.max(...heartRates) : null,
    pointCount: track.length,
    hasHeartRate: heartRates.length > 0,
  }
}
