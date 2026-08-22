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
      filters: [{ services: [HEART_RATE_SERVICE] }],
    })
  } catch (error) {
    // Dismissing the chooser is a normal action, not a failure worth shouting
    // about; anything else is worth surfacing.
    if (error?.name === 'NotFoundError') throw new Error('No strap selected.')
    throw new Error('Could not open the Bluetooth chooser. Make sure Bluetooth is on.')
  }

  const characteristic = await openStream(device, onReading)

  const handleDisconnect = () => {
    onStatus?.('disconnected')
  }
  device.addEventListener('gattserverdisconnected', handleDisconnect)

  onStatus?.('connected')

  return {
    deviceName: device.name || 'Heart-rate strap',
    /**
     * Attempt to re-establish a dropped link.
     *
     * Straps drop out routinely — sweat, a jersey pocket, a battery dip — and a
     * ride is long. Reconnecting keeps the rest of the ride's heart rate rather
     * than ending the stream at the first blip.
     */
    async reconnect() {
      await openStream(device, onReading)
      onStatus?.('connected')
    },
    async disconnect() {
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
