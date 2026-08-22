/**
 * Live-recording helpers.
 *
 * The decision-making parts of ride recording, kept pure so they can be checked
 * in Node. RecordRide.jsx owns the browser APIs and the state machine; this
 * module owns the judgement calls that would otherwise be untestable logic
 * buried in an event handler.
 */

import { haversineMiles } from './metrics.js'
import { latOf, lonOf, timeOf, elevationOf, elevationGainMeters } from './track.js'

/**
 * Below this speed the rider is treated as stopped.
 *
 * Chosen above GPS jitter and below a slow crawl. A stationary phone still
 * reports small position changes, which integrate to a phantom 1–2 mph; a rider
 * actually turning the pedals over on a steep climb is comfortably above 3.
 */
export const AUTO_PAUSE_MPH = 3

/**
 * How much recent track to judge movement from.
 *
 * Too short and a single bad fix pauses the ride mid-climb; too long and a real
 * stop at a trailhead keeps counting for half a minute. Twelve seconds is long
 * enough to average out one bad point at a typical 1 Hz fix rate.
 */
export const MOVEMENT_WINDOW_SEC = 12

/**
 * Speed over the last `windowSec` of a track, in mph.
 *
 * Returns null when the track is too short or carries no usable timestamps —
 * never zero, which would read as "stopped" and trigger an auto-pause on a ride
 * that has simply not produced two timed points yet.
 */
export function currentSpeedMph(track, windowSec = MOVEMENT_WINDOW_SEC) {
  if (!Array.isArray(track) || track.length < 2) return null

  const timed = track.filter((p) => timeOf(p) !== null && latOf(p) !== null && lonOf(p) !== null)
  if (timed.length < 2) return null

  const latest = timeOf(timed[timed.length - 1])
  const cutoff = latest - windowSec * 1000

  // Walk back to the first point inside the window, then step one further so a
  // window containing a single point still spans an interval.
  let startIndex = timed.length - 1
  while (startIndex > 0 && timeOf(timed[startIndex - 1]) >= cutoff) startIndex -= 1
  if (startIndex === timed.length - 1) startIndex -= 1

  const elapsedHours = (latest - timeOf(timed[startIndex])) / 3600_000
  if (!(elapsedHours > 0)) return null

  let miles = 0
  for (let i = startIndex + 1; i < timed.length; i += 1) {
    miles += haversineMiles(timed[i - 1], timed[i])
  }

  return Math.round((miles / elapsedHours) * 10) / 10
}

/**
 * Whether recording should auto-pause, given the track so far.
 *
 * Deliberately conservative: an unknown speed is treated as moving. Pausing a
 * ride because GPS has not settled yet would silently lose the first minutes of
 * every ride, which is worse than counting a brief stop.
 */
export function shouldAutoPause(track, { thresholdMph = AUTO_PAUSE_MPH, windowSec = MOVEMENT_WINDOW_SEC } = {}) {
  const speed = currentSpeedMph(track, windowSec)
  if (speed === null) return false
  return speed < thresholdMph
}

/** Total climb so far, in metres, or null when the device reports no altitude. */
export function climbSoFarMeters(track) {
  return elevationGainMeters(track)
}

/**
 * Most recent elevation reading, in metres, or null.
 *
 * Reads backwards because altitude drops in and out as the fix quality changes,
 * so the last point is often not the last point *with* an elevation.
 */
export function latestElevationMeters(track) {
  if (!Array.isArray(track)) return null
  for (let i = track.length - 1; i >= 0; i -= 1) {
    const ele = elevationOf(track[i])
    if (ele !== null) return ele
  }
  return null
}

/**
 * Parse a Bluetooth Heart Rate Measurement characteristic (GATT 0x2A37).
 *
 * The layout is fixed by the Bluetooth SIG spec: byte 0 is a flags field, and
 * bit 0 of it says whether the heart rate that follows is one byte or two.
 * Straps disagree about which they use — most send uint8, but a value above 255
 * forces uint16, and some send uint16 always. Reading the wrong width yields
 * plausible-looking nonsense rather than an error, which is exactly why this is
 * a pure function with tests rather than three lines inside a listener.
 *
 * Multi-byte values are little-endian, per the spec.
 *
 * Accepts anything with `getUint8`/`byteLength` — a real DataView in the
 * browser, a constructed one in tests.
 */
export function parseHeartRateMeasurement(view) {
  if (!view || typeof view.getUint8 !== 'function' || view.byteLength < 2) return null

  const flags = view.getUint8(0)
  const isUint16 = (flags & 0x01) === 1

  if (isUint16) {
    if (view.byteLength < 3) return null
    // Little-endian: low byte first.
    const bpm = view.getUint8(1) | (view.getUint8(2) << 8)
    return bpm > 0 && bpm < 300 ? bpm : null
  }

  const bpm = view.getUint8(1)
  // A zero reading is a strap that has lost skin contact, not a stopped heart.
  return bpm > 0 && bpm < 300 ? bpm : null
}
