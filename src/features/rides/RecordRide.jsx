import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, Square, Satellite } from 'lucide-react'
import { trackDistanceMiles } from '../../data/metrics.js'
import { formatStopwatch } from '../../data/dates.js'
import RouteMap from './RouteMap.jsx'

/**
 * GPS ride recording via the browser Geolocation API.
 *
 * Scope is deliberate: this records a track and a distance, then hands both to
 * the ride form to finish. It is not trying to be a head unit — no navigation,
 * no live segments. What it must do is not lose the track, which is why points
 * are mirrored to localStorage on every update.
 */

const DRAFT_KEY = 'ridelab_active_recording'

export default function RecordRide({ onFinish, onCancel }) {
  const [state, setState] = useState('idle') // idle | recording | paused
  const [track, setTrack] = useState([])
  const [elapsedMs, setElapsedMs] = useState(0)
  const [accuracy, setAccuracy] = useState(null)
  const [error, setError] = useState(null)

  const watchIdRef = useRef(null)
  const wakeLockRef = useRef(null)
  // Elapsed time is derived from timestamps rather than counted with the
  // interval, so a backgrounded tab (which throttles timers) still reports the
  // true ride duration.
  const startedAtRef = useRef(null)
  const accumulatedRef = useRef(0)

  const distanceMi = trackDistanceMiles(track)

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
    const id = setInterval(() => {
      setElapsedMs(accumulatedRef.current + (Date.now() - (startedAtRef.current ?? Date.now())))
    }, 1000)
    return () => clearInterval(id)
  }, [state])

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [])

  useEffect(() => stopWatching, [stopWatching])

  const startWatching = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('This device or browser does not support GPS.')
      return false
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy: acc } = position.coords
        setAccuracy(acc)

        // Drop garbage fixes. Early points from a cold GPS can be hundreds of
        // metres off and would add phantom miles to the distance.
        if (acc != null && acc > 50) return

        setTrack((prev) => {
          const next = [...prev, [latitude, longitude, position.timestamp]]
          persistDraft(next, accumulatedRef.current + (Date.now() - (startedAtRef.current ?? Date.now())))
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
  }, [persistDraft])

  async function handleStart() {
    setError(null)
    if (!startWatching()) return

    startedAtRef.current = Date.now()
    setState('recording')

    // Best-effort: keeps the screen on so the browser doesn't suspend the tab
    // mid-ride. Unsupported on iOS Safari, hence the silent catch.
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      }
    } catch {
      /* not available — recording continues regardless */
    }
  }

  function handlePause() {
    accumulatedRef.current += Date.now() - (startedAtRef.current ?? Date.now())
    setElapsedMs(accumulatedRef.current)
    stopWatching()
    setState('paused')
  }

  function handleResume() {
    startedAtRef.current = Date.now()
    startWatching()
    setState('recording')
  }

  function handleStop() {
    const finalElapsed =
      state === 'recording'
        ? accumulatedRef.current + (Date.now() - (startedAtRef.current ?? Date.now()))
        : accumulatedRef.current

    stopWatching()
    clearDraft()

    onFinish({
      track,
      distanceMi: Math.round(trackDistanceMiles(track) * 100) / 100,
      durationMin: Math.round((finalElapsed / 60000) * 10) / 10,
    })
  }

  function handleDiscard() {
    stopWatching()
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
          <div className="muted">elapsed</div>
        </div>
      </div>

      {track.length > 1 && <RouteMap track={track} height={140} />}

      {error && (
        <p className="muted" style={{ margin: 0, color: 'var(--status-error)' }}>
          {error}
        </p>
      )}

      {state === 'idle' && track.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          Keep this screen open while you ride. Points are saved as you go, so a crash or a locked
          phone will not lose the track.
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
