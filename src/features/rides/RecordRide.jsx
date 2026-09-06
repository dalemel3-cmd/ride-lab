import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Square, Satellite, HeartPulse, Mountain, Gauge } from 'lucide-react'
import { hrZone } from '../../data/metrics.js'
import { formatStopwatch } from '../../data/dates.js'
import { METERS_TO_FEET } from '../../data/track.js'
import {
  currentSpeedMph,
  shouldAutoPause,
  climbSoFarMeters,
  movingDistanceMiles,
  AUTO_PAUSE_MPH,
} from '../../data/recording.js'
import {
  isSupported as bluetoothSupported,
  connectHeartRate,
  readBatteryLevel,
} from '../../data/heartRateSensor.js'
import RouteMap from './RouteMap.jsx'

/**
 * GPS ride recording via the browser Geolocation API, with optional heart rate
 * from a Bluetooth strap.
 *
 * Scope is deliberate: this records a track and hands it to the ride form to
 * finish. It is not trying to be a head unit — no navigation, no live segments.
 * What it must do is not lose the track, which is why points are mirrored to
 * localStorage on every update.
 */

const DRAFT_KEY = 'ridelab_active_recording'

export default function RecordRide({ onFinish, onCancel, maxHr, zoneRanges }) {
  const [state, setState] = useState('idle') // idle | recording | paused
  const [track, setTrack] = useState([])
  const [elapsedMs, setElapsedMs] = useState(0)
  const [accuracy, setAccuracy] = useState(null)
  const [error, setError] = useState(null)

  // Auto-pause is separate from a manual pause: it has to keep watching GPS to
  // notice the rider moving again, where a manual pause deliberately stops.
  const [autoPaused, setAutoPaused] = useState(false)
  const autoPausedRef = useRef(false)

  const [heartRate, setHeartRate] = useState(null)
  const [strap, setStrap] = useState(null)
  // idle | connecting | connected | reconnecting | lost
  const [strapStatus, setStrapStatus] = useState('idle')
  const [strapBattery, setStrapBattery] = useState(null)

  // Latest reading, read inside the geolocation callback. State would be stale
  // there — the callback closes over the value from the render that registered
  // it, which on a long ride is minutes old.
  const heartRateRef = useRef(null)

  const watchIdRef = useRef(null)
  const wakeLockRef = useRef(null)
  // Elapsed time is derived from timestamps rather than counted with the
  // interval, so a backgrounded tab (which throttles timers) still reports the
  // true ride duration.
  const startedAtRef = useRef(null)
  const accumulatedRef = useRef(0)

  // Moving distance, not raw track distance: a stationary phone wanders a few
  // metres between fixes, and counting that turns every stop into real mileage.
  const distanceMi = useMemo(() => movingDistanceMiles(track), [track])

  const liveSpeed = useMemo(() => currentSpeedMph(track), [track])
  const climbM = useMemo(() => climbSoFarMeters(track), [track])

  // Averaged over the ride's own points, so the figure handed to the form is
  // measured rather than estimated.
  const { averageRecordedHr, maxRecordedHr } = useMemo(() => {
    let sum = 0
    let count = 0
    let peak = null
    for (const point of track) {
      const bpm = point[4]
      if (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm <= 0) continue
      sum += bpm
      count += 1
      if (peak === null || bpm > peak) peak = bpm
    }
    return {
      averageRecordedHr: count > 0 ? Math.round(sum / count) : null,
      maxRecordedHr: peak,
    }
  }, [track])

  // hrZone returns the whole zone descriptor — number, label, colour, and what
  // it does physiologically — so the readout can explain itself mid-ride.
  const zone = heartRate != null && (zoneRanges || maxHr) ? hrZone(heartRate, zoneRanges || maxHr) : null
  const zoneColor = zone?.color ?? 'var(--color-text-muted)'

  // Recover a recording interrupted by a crash, a reload, or iOS reclaiming the
  // tab — the one failure mode that would otherwise cost a whole ride.
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')
      if (draft?.track?.length > 1) {
        setTrack(draft.track)
        accumulatedRef.current = draft.elapsedMs ?? 0
        setElapsedMs(draft.elapsedMs ?? 0)
        setState('paused')
      }
    } catch {
      /* nothing recoverable */
    }
  }, [])

  /**
   * Moving time so far.
   *
   * `startedAtRef` is null whenever the clock is frozen — auto-paused, or
   * manually paused — so the running segment contributes nothing and stopped
   * time never reaches the total. This is what keeps a five-minute trailhead
   * stop from dragging down average speed and inflating VAM.
   */
  const elapsedFrom = useCallback(
    () => accumulatedRef.current + (startedAtRef.current ? Date.now() - startedAtRef.current : 0),
    [],
  )

  const persistDraft = useCallback((nextTrack, nextElapsed) => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ track: nextTrack, elapsedMs: nextElapsed }))
    } catch {
      /* storage full — recording still works in memory */
    }
  }, [])

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  // Tick the display. The value shown is computed from wall-clock time.
  useEffect(() => {
    if (state !== 'recording') return
    const id = setInterval(() => setElapsedMs(elapsedFrom()), 1000)
    return () => clearInterval(id)
  }, [state, elapsedFrom])

  /**
   * Ask the screen to stay awake.
   *
   * Best-effort — unsupported on iOS Safari, and the browser silently drops the
   * lock whenever the tab is backgrounded, so this has to be callable again
   * rather than requested once at the start.
   */
  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator) || wakeLockRef.current) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
      // The browser fires this when it takes the lock back; clearing the ref
      // means the next re-acquire attempt is not skipped as already-held.
      wakeLockRef.current.addEventListener?.('release', () => {
        wakeLockRef.current = null
      })
    } catch {
      /* denied or unsupported — recording continues either way */
    }
  }, [])

  async function handleConnectStrap() {
    setError(null)
    setStrapStatus('connecting')
    try {
      const handle = await connectHeartRate({
        onReading: (bpm) => {
          heartRateRef.current = bpm
          setHeartRate(bpm)
        },
        onStatus: (status) => {
          if (status === 'connected') {
            setStrapStatus('connected')
            return
          }
          // A stale number looks live and is worse than none, so the reading is
          // cleared the moment the link drops. 'lost' means the automatic
          // retries gave up — the rider has to do something about it.
          heartRateRef.current = null
          setHeartRate(null)
          setStrapStatus(status === 'lost' ? 'lost' : 'reconnecting')
        },
      })
      setStrap(handle)
      setStrapStatus('connected')
      readBatteryLevel(handle.device).then(setStrapBattery)
    } catch (err) {
      setStrapStatus('idle')
      setError(err.message)
    }
  }

  async function handleDisconnectStrap() {
    await strap?.disconnect().catch(() => {})
    setStrap(null)
    setStrapStatus('idle')
    setStrapBattery(null)
    heartRateRef.current = null
    setHeartRate(null)
  }

  // Release the strap if the screen unmounts mid-ride, so the connection does
  // not outlive the recording it belongs to.
  useEffect(() => {
    return () => {
      strap?.disconnect().catch(() => {})
    }
  }, [strap])

  const clearGeoWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  const stopWatching = useCallback(() => {
    clearGeoWatch()
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [clearGeoWatch])

  useEffect(() => stopWatching, [stopWatching])

  /**
   * Auto-pause, decided from the points already recorded.
   *
   * This has to live in an effect rather than inside the `setTrack` updater.
   * React invokes updater functions twice under StrictMode to surface impure
   * ones, so adjusting the clock in there banked the elapsed time twice on
   * every transition and made moving time run fast. Updaters must be pure;
   * this is the side effect they were hiding.
   *
   * The ref guard makes the effect idempotent, which matters for the same
   * reason — StrictMode runs effects twice on mount.
   */
  useEffect(() => {
    if (state !== 'recording') return

    const stopped = shouldAutoPause(track)
    if (stopped === autoPausedRef.current) return

    autoPausedRef.current = stopped
    if (stopped) {
      // Bank the time ridden so far, then stop the clock.
      accumulatedRef.current = elapsedFrom()
      startedAtRef.current = null
    } else {
      startedAtRef.current = Date.now()
    }
    setAutoPaused(stopped)
  }, [track, state, elapsedFrom])

  // Re-take the wake lock whenever the tab comes back to the foreground while
  // recording. Browsers release it on every backgrounding — checking the map,
  // taking a call — and without this the screen sleeps for the rest of the
  // ride, which is exactly when the tab gets suspended and GPS points stop.
  useEffect(() => {
    if (state !== 'recording') return

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      acquireWakeLock()

      // Re-arm the GPS watch as well. A backgrounded tab has its geolocation
      // watch throttled or suspended, and browsers do not reliably resume it —
      // so checking a map, taking a call, or letting the screen lock would
      // silently end the track while the UI went on claiming to record. This
      // is the difference between a ride that logs and one that quietly stops
      // at the first interruption.
      clearGeoWatch()
      startWatchingRef.current?.()
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [state, acquireWakeLock, clearGeoWatch])

  const startWatching = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('This device or browser does not support GPS.')
      return false
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy: acc, altitude, altitudeAccuracy } = position.coords
        setAccuracy(acc)

        // A fix arrived, so any earlier "no GPS" warning is stale. Without
        // this it stays on screen for the rest of the ride, telling the rider
        // recording has failed while the track is visibly being drawn.
        setError((current) => (current && current.startsWith('Could not get a GPS fix') ? null : current))

        // Drop garbage fixes. Early points from a cold GPS can be hundreds of
        // metres off and would add phantom miles to the distance.
        if (acc != null && acc > 50) return

        // Altitude is null on most phones without a barometer, and wildly
        // imprecise on some that report it. Keep it only when the device
        // vouches for it, since a noisy altitude inflates climb totals far
        // more than it informs — and null here is honest, where a guess is not.
        const elevationM =
          typeof altitude === 'number' &&
          Number.isFinite(altitude) &&
          (altitudeAccuracy == null || altitudeAccuracy <= 15)
            ? altitude
            : null

        setTrack((prev) => {
          // Heart rate comes from a paired Bluetooth strap, and is null when
          // none is connected or the link has dropped. Read from a ref, because
          // this callback closes over state from the render that registered it.
          const next = [
            ...prev,
            [latitude, longitude, position.timestamp, elevationM, heartRateRef.current],
          ]
          persistDraft(next, elapsedFrom())
          return next
        })
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Allow it in your browser settings, or log the ride manually.'
            : 'Could not get a GPS fix. Try again outdoors.',
        )
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    )
    return true
  }, [persistDraft, elapsedFrom])

  // The visibility handler is declared above startWatching, so it reaches it
  // through a ref rather than forcing the two into a circular dependency.
  const startWatchingRef = useRef(null)
  startWatchingRef.current = startWatching

  async function handleStart() {
    setError(null)
    if (!startWatching()) return

    startedAtRef.current = Date.now()
    setState('recording')
    await acquireWakeLock()
  }

  function handlePause() {
    accumulatedRef.current = elapsedFrom()
    startedAtRef.current = null
    setElapsedMs(accumulatedRef.current)
    stopWatching()
    autoPausedRef.current = false
    setAutoPaused(false)
    setState('paused')
  }

  function handleResume() {
    startedAtRef.current = Date.now()
    startWatching()
    setState('recording')
    // Pausing released the lock, so resuming has to take it again — otherwise
    // the screen sleeps for every ride that was ever paused once.
    acquireWakeLock()
  }

  function handleStop() {
    const finalElapsed = elapsedFrom()

    stopWatching()
    strap?.disconnect().catch(() => {})
    clearDraft()

    onFinish({
      track,
      distanceMi: Math.round(distanceMi * 100) / 100,
      durationMin: Math.round((finalElapsed / 60000) * 10) / 10,
      // Pre-fills the form so the rider is not retyping what the strap already
      // measured. RPE is deliberately left blank — no sensor knows how hard it
      // felt, and inferring it would fabricate the study's key subjective field.
      avgHr: averageRecordedHr,
      maxHr: maxRecordedHr,
      elevationFt: climbM !== null ? Math.round(climbM * METERS_TO_FEET) : null,
    })
  }

  function handleDiscard() {
    stopWatching()
    strap?.disconnect().catch(() => {})
    clearDraft()
    onCancel()
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Satellite size={18} color="var(--color-accent)" aria-hidden="true" />
        <strong style={{ fontFamily: 'var(--font-display)', textTransform: 'uppercase' }}>
          Recording
        </strong>
        {autoPaused && (
          <span
            style={{
              color: 'var(--status-warn)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            Auto-paused
          </span>
        )}
        {accuracy != null && (
          <span className="muted" style={{ marginLeft: 'auto' }}>
            ±{Math.round(accuracy)}m
          </span>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-3xl)',
              color: 'var(--color-accent)',
            }}
          >
            {distanceMi.toFixed(2)}
          </div>
          <div className="muted">miles</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)' }}>
            {formatStopwatch(elapsedMs)}
          </div>
          <div className="muted">{autoPaused ? 'moving time (paused)' : 'moving time'}</div>
        </div>
      </div>

      {/* Live heart rate, the reason a strap is worth pairing at all. */}
      {heartRate != null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: `1px solid ${zoneColor}`,
            background: `color-mix(in srgb, ${zoneColor} 12%, transparent)`,
          }}
        >
          <HeartPulse size={22} color={zoneColor} aria-hidden="true" style={{ flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-2xl)',
                color: zoneColor,
              }}
            >
              {heartRate}
            </span>
            <span className="muted">bpm</span>
          </div>
          {zone && (
            <div style={{ marginLeft: 'auto', textAlign: 'right', minWidth: 0 }}>
              <div style={{ color: zoneColor, fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                Zone {zone.zone} · {zone.label}
              </div>
              <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                {zone.effect}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Secondary readouts. Each hides itself rather than showing a zero,
          because "0 mph" and "0 ft" read as measurements when they are really
          "not known yet". */}
      {((liveSpeed !== null && !autoPaused) || climbM !== null) && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {/* Hidden while auto-paused: a stationary phone's fixes zigzag, so
              the path-based figure reads as a brisk pace beside a "paused"
              badge, which just looks broken. */}
          {liveSpeed !== null && !autoPaused && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)' }}>
              <Gauge size={16} color="var(--color-accent)" aria-hidden="true" />
              {liveSpeed.toFixed(1)} mph now
            </span>
          )}
          {climbM !== null && climbM > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)' }}>
              <Mountain size={16} color="var(--color-accent)" aria-hidden="true" />
              {Math.round(climbM * METERS_TO_FEET)} ft climbed
            </span>
          )}
        </div>
      )}

      {track.length > 1 && <RouteMap track={track} height={140} />}

      {error && (
        <p className="muted" style={{ margin: 0, color: 'var(--status-error)' }}>
          {error}
        </p>
      )}

      {/* Strap pairing. Offered whether or not recording has started, so the
          link can be established before rolling out. */}
      {bluetoothSupported() ? (
        strapStatus === 'connected' || strapStatus === 'reconnecting' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)' }}>
              <HeartPulse
                size={16}
                color={strapStatus === 'connected' ? 'var(--status-success)' : 'var(--status-warn)'}
                aria-hidden="true"
              />
              <span className="muted">
                {strap?.deviceName ?? 'Strap'}{' '}
                {strapStatus === 'connected' ? 'connected' : 'reconnecting…'}
                {strapBattery != null && ` · ${strapBattery}%`}
              </span>
              <button
                className="btn"
                style={{ marginLeft: 'auto', padding: '6px 10px', minHeight: 'var(--tap-target)' }}
                onClick={handleDisconnectStrap}
              >
                Disconnect
              </button>
            </div>
            {strapBattery != null && strapBattery <= 15 && (
              // Worth flagging before a long ride: a strap that dies halfway
              // leaves a trace that stops mid-ride, which is the kind of gap
              // that quietly ruins a comparison months later.
              <p className="muted" style={{ margin: 0, color: 'var(--status-warn)' }}>
                Strap battery is at {strapBattery}%. Worth a fresh cell before a long ride.
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn" onClick={handleConnectStrap} disabled={strapStatus === 'connecting'}>
              <HeartPulse size={18} aria-hidden="true" />
              {strapStatus === 'connecting'
                ? 'Searching…'
                : strapStatus === 'lost'
                  ? 'Reconnect heart-rate strap'
                  : 'Connect heart-rate strap'}
            </button>
            {strapStatus === 'lost' && (
              <p className="muted" style={{ margin: 0, color: 'var(--status-warn)' }}>
                The strap stopped responding and automatic reconnects gave up. Recording continues —
                points from here on carry no heart rate. Check the electrodes are damp and the
                battery is good.
              </p>
            )}
            {strapStatus === 'idle' && (
              <p className="muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
                Polar H10: wet the electrodes before pairing, and close Polar Flow or any watch
                holding the strap — it will not appear in the list while another app has it.
              </p>
            )}
          </div>
        )
      ) : (
        // Saying why is more useful than hiding the feature and leaving the
        // rider to wonder whether their strap is broken.
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
          Heart-rate straps need Web Bluetooth, which this browser does not support. Chrome on
          Android works; Safari on iPhone does not. Importing a GPX file from a head unit still
          brings heart rate in.
        </p>
      )}

      {state === 'idle' && track.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          Keep this screen open while you ride. Points are saved as you go, so a crash or a locked
          phone will not lose the track. Recording pauses itself below {AUTO_PAUSE_MPH} mph, so
          stops do not count as riding time.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {state === 'idle' && (
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleStart}>
            <Play size={18} aria-hidden="true" /> Start
          </button>
        )}
        {state === 'recording' && (
          <button className="btn" style={{ flex: 1 }} onClick={handlePause}>
            <Pause size={18} aria-hidden="true" /> Pause
          </button>
        )}
        {state === 'paused' && (
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleResume}>
            <Play size={18} aria-hidden="true" /> Resume
          </button>
        )}
        {state !== 'idle' && (
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleStop}>
            <Square size={18} aria-hidden="true" /> Finish
          </button>
        )}
        <button className="btn" onClick={handleDiscard}>
          Discard
        </button>
      </div>
    </div>
  )
}
