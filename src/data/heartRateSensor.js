/**
 * Heart-rate strap over Web Bluetooth.
 *
 * Uses the standard Bluetooth SIG Heart Rate Service (0x180D) and its Heart
 * Rate Measurement characteristic (0x2A37), which every mainstream chest strap
 * and armband implements — Polar, Garmin, Wahoo, Coospo — plus watches set to
 * "broadcast heart rate". No vendor SDK, no account, no pairing code.
 *
 * This closes the gap that made in-app recording much less useful than GPX
 * import: recorded rides stored no heart rate at all, so they could not
 * contribute a segment heart rate, a zone distribution, or a TRIMP — most of
 * what the study is actually measuring.
 *
 * Deliberately thin. Everything with real bug potential — parsing the
 * measurement packet — lives in recording.js as a pure, tested function.
 *
 * ## Support
 *
 * Chrome and Edge on Android, Chrome and Edge on desktop. **Not Safari on iOS**:
 * Apple has not shipped Web Bluetooth, so on an iPhone this needs a third-party
 * browser such as Bluefy. `isSupported()` reports the truth rather than letting
 * the UI offer something that cannot work.
 *
 * Requires a secure context (Vercel is HTTPS) and a real user gesture — the
 * chooser cannot be opened from a timer or on page load.
 */

import { parseHeartRateMeasurement } from './recording.js'

const HEART_RATE_SERVICE = 'heart_rate'
const HEART_RATE_MEASUREMENT = 'heart_rate_measurement'
const BATTERY_SERVICE = 'battery_service'

/** How many times to chase a dropped strap before leaving it alone. */
const MAX_RECONNECT_ATTEMPTS = 6

/** Whether this browser can talk to a strap at all. */
export function isSupported() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

/**
 * Prompt for a strap and start streaming.
 *
 * Must be called from a click. Resolves to a handle with `disconnect()` and the
 * device name; rejects with a message meant to be shown to the rider.
 *
 * `onReading` receives beats per minute. `onStatus` receives 'connected' or
 * 'disconnected' so the UI can show that a strap dropped mid-ride rather than
 * silently freezing on the last value — a stale number is worse than none,
 * because it looks live.
 */
export async function connectHeartRate({ onReading, onStatus } = {}) {
  if (!isSupported()) {
    throw new Error(
      'This browser cannot connect to a heart-rate strap. Chrome on Android works; Safari on iPhone does not support Web Bluetooth.',
    )
  }

  let device
  try {
    device = await navigator.bluetooth.requestDevice({
      // Matching on the advertised service is the correct primary filter, but
      // it is not sufficient on its own. A strap already connected to another
      // app — Polar Flow, a watch, Zwift — may advertise differently or not at
      // all, and some firmware omits the service UUID from the advertising
      // packet even though it implements the service. The name prefixes catch
      // those, which is the difference between an empty chooser and a working
      // strap.
      filters: [
        { services: [HEART_RATE_SERVICE] },
        { namePrefix: 'Polar' },
        { namePrefix: 'Garmin' },
        { namePrefix: 'Wahoo' },
        { namePrefix: 'TICKR' },
        { namePrefix: 'COOSPO' },
      ],
      // Required: a device matched by name rather than by service is not
      // granted access to that service unless it is declared here. Without
      // this, a Polar H10 picked from the list connects and then throws
      // SecurityError on getPrimaryService.
      optionalServices: [HEART_RATE_SERVICE, BATTERY_SERVICE],
    })
  } catch (error) {
    // Cancelling and finding nothing both surface as NotFoundError, so the
    // message has to cover the case where the chooser was simply empty.
    if (error?.name === 'NotFoundError') {
      throw new Error(
        'No strap selected. If the list was empty: wet the electrodes so the strap wakes up, and close any other app connected to it — a Polar H10 will not appear here while Polar Flow, a watch, or Zwift holds it.',
      )
    }
    if (error?.name === 'SecurityError') {
      throw new Error('Bluetooth needs a secure connection. Open the app over https.')
    }
    throw new Error(
      `Could not open the Bluetooth chooser (${error?.name ?? 'unknown error'}). Check that Bluetooth is on, and on Android that the browser has Location and Nearby devices permission.`,
    )
  }

  let characteristic
  try {
    characteristic = await openStream(device, onReading)
  } catch (error) {
    if (error?.name === 'NetworkError') {
      throw new Error(
        'The strap was found but would not connect. It is probably still paired to another app or device — disconnect it there and try again.',
      )
    }
    throw new Error(`Could not read heart rate from the strap (${error?.name ?? 'unknown error'}).`)
  }

  // Straps drop out routinely mid-ride: sweat bridging the electrodes, a jersey
  // shifting, a battery dip. Reconnecting automatically keeps the rest of the
  // ride's heart rate instead of ending the stream at the first blip — over a
  // two-hour ride that is the difference between one usable trace and several
  // fragments. Attempts back off so a strap that has genuinely gone (battery
  // dead, out of range) does not spin the radio for the rest of the ride.
  let reconnectAttempts = 0
  let reconnectTimer = null
  let abandoned = false

  const attemptReconnect = () => {
    if (abandoned || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) onStatus?.('lost')
      return
    }
    const delay = Math.min(30_000, 2 ** reconnectAttempts * 1000)
    reconnectAttempts += 1
    reconnectTimer = setTimeout(async () => {
      if (abandoned) return
      try {
        characteristic = await openStream(device, onReading)
        reconnectAttempts = 0
        onStatus?.('connected')
      } catch {
        attemptReconnect()
      }
    }, delay)
  }

  const handleDisconnect = () => {
    onStatus?.('disconnected')
    attemptReconnect()
  }
  device.addEventListener('gattserverdisconnected', handleDisconnect)

  onStatus?.('connected')

  return {
    deviceName: device.name || 'Heart-rate strap',
    /** Exposed so the caller can read optional extras such as battery level. */
    device,
    /** Force a reconnect attempt now, ignoring the backoff. */
    async reconnect() {
      abandoned = false
      reconnectAttempts = 0
      characteristic = await openStream(device, onReading)
      onStatus?.('connected')
    },
    async disconnect() {
      // Stop the retry loop first, or a scheduled attempt reconnects a strap
      // the rider just asked to release.
      abandoned = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      device.removeEventListener('gattserverdisconnected', handleDisconnect)
      try {
        await characteristic?.stopNotifications()
      } catch {
        /* already gone */
      }
      if (device.gatt?.connected) device.gatt.disconnect()
      onStatus?.('disconnected')
    },
  }
}

/**
 * Battery level, 0–100, or null when the strap does not expose it.
 *
 * Worth knowing before a long ride: a Polar H10 that dies mid-ride leaves a
 * heart-rate trace that stops halfway, which is the kind of gap that quietly
 * ruins a comparison months later.
 */
export async function readBatteryLevel(device) {
  try {
    const server = device.gatt?.connected ? device.gatt : await device.gatt.connect()
    const service = await server.getPrimaryService(BATTERY_SERVICE)
    const characteristic = await service.getCharacteristic('battery_level')
    const value = await characteristic.readValue()
    return value.getUint8(0)
  } catch {
    // Optional extra — never let a missing battery service break a connection
    // that is otherwise streaming heart rate perfectly well.
    return null
  }
}

/** Connect GATT and subscribe to measurement notifications. */
async function openStream(device, onReading) {
  const server = await device.gatt.connect()
  const service = await server.getPrimaryService(HEART_RATE_SERVICE)
  const characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT)

  characteristic.addEventListener('characteristicvaluechanged', (event) => {
    const bpm = parseHeartRateMeasurement(event.target.value)
    // parseHeartRateMeasurement returns null for a zero reading — a strap that
    // has lost skin contact. Passing that through would record a rider with no
    // pulse; dropping it leaves a gap, which is the honest outcome.
    if (bpm !== null) onReading?.(bpm)
  })

  await characteristic.startNotifications()
  return characteristic
}
