import { useMemo, useRef, useState } from 'react'
import { Plus, Satellite, Trash2, Pencil, Upload } from 'lucide-react'
import { saveRow, deleteRow, TABLES, queueLength } from '../../data/store.js'
import { avgSpeed, trainingLoad, hrZone, summarize, timeInZones } from '../../data/metrics.js'
import { formatDuration, formatShortDate, toDateString, toTimeString, startOfWeek, recordDate } from '../../data/dates.js'
import { StatGrid, StatTile, EmptyState } from '../../components/ui.jsx'
import ZoneBar from '../../components/ZoneBar.jsx'
import { elevationGainMeters, METERS_TO_FEET } from '../../data/track.js'
import RideForm from './RideForm.jsx'
import RecordRide from './RecordRide.jsx'
import RouteMap from './RouteMap.jsx'
import ElevationProfile from './ElevationProfile.jsx'
import { parseGpx } from '../../data/gpx.js'

/**
 * The ride log: every ride, newest first, grouped by training week.
 *
 * Weeks rather than a flat list because volume is a weekly quantity in every
 * training model worth following — seeing "this week: 3 rides, 24 mi" is what
 * actually drives the next decision.
 */
export default function RideLogScreen({ rides, routes, settings, refresh, showToast, setPending }) {
  const [mode, setMode] = useState('list') // list | form | record
  const [editing, setEditing] = useState(null)
  const [prefill, setPrefill] = useState(null)
  const fileInputRef = useRef(null)

  const totals = useMemo(() => summarize(rides), [rides])

  const weeks = useMemo(() => {
    const grouped = new Map()
    for (const ride of rides) {
      const week = startOfWeek(recordDate(ride))
      if (!grouped.has(week)) grouped.set(week, [])
      grouped.get(week).push(ride)
    }
    // Newest week first, matching the newest-first ride order from the store.
    return [...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [rides])

  async function handleSave(record) {
    const { synced } = await saveRow(TABLES.rides, record)
    setPending(queueLength())
    showToast(synced ? 'Ride saved' : 'Saved on device — will sync when back online')
    setMode('list')
    setEditing(null)
    setPrefill(null)
    refresh()
  }

  async function handleDelete(ride) {
    if (!window.confirm(`Delete the ${formatShortDate(recordDate(ride))} ride?`)) {
      return
    }
    await deleteRow(TABLES.rides, ride.id)
    setPending(queueLength())
    showToast('Ride deleted')
    refresh()
  }

  function handleRecordingFinished({ track, distanceMi, durationMin, avgHr, maxHr, elevationFt }) {
    // Hand the measured numbers to the manual form so RPE — the one thing no
    // sensor can know — gets filled in while the ride is still fresh. Heart
    // rate and climb are prefilled only when they were actually measured; a
    // strap-less ride leaves those fields blank rather than showing a zero.
    setPrefill({
      date: toDateString(),
      time: toTimeString(),
      distance_mi: distanceMi,
      duration_min: durationMin,
      ...(avgHr != null ? { avg_hr: avgHr } : {}),
      ...(maxHr != null ? { max_hr: maxHr } : {}),
      ...(elevationFt != null ? { elevation_ft: elevationFt } : {}),
      track,
    })
    setMode('form')
  }

  async function handleGpxFile(event) {
    const file = event.target.files?.[0]
    // Reset immediately so picking the same file twice still fires a change.
    event.target.value = ''
    if (!file) return

    try {
      const parsed = parseGpx(await file.text())
      if (!parsed) {
        showToast('No track points in that file', 'error')
        return
      }

      const started = parsed.startedAt ? new Date(parsed.startedAt) : new Date()
      setPrefill({
        date: toDateString(started),
        time: toTimeString(started),
        route_name: parsed.name ?? '',
        distance_mi: parsed.distanceMi,
        duration_min: parsed.durationMin ?? '',
        elevation_ft: parsed.elevationFt ?? '',
        avg_hr: parsed.avgHr ?? '',
        max_hr: parsed.maxHr ?? '',
        track: parsed.track,
      })
      setMode('form')
      showToast(
        parsed.hasHeartRate
          ? `Imported ${parsed.distanceMi} mi with heart rate`
          : `Imported ${parsed.distanceMi} mi — add RPE and heart rate`,
      )
    } catch (error) {
      showToast(String(error.message ?? error), 'error')
    }
  }

  if (mode === 'record') {
    return (
      <div className="screen">
        <div className="screen-header">
          <h2>Record ride</h2>
        </div>
        <RecordRide
          onFinish={handleRecordingFinished}
          onCancel={() => setMode('list')}
          maxHr={settings?.maxHr}
        />
      </div>
    )
  }

  if (mode === 'form') {
    return (
      <div className="screen">
        <div className="screen-header">
          <h2>{editing ? 'Edit ride' : 'Log ride'}</h2>
        </div>
        <RideForm
          routes={routes}
          settings={settings}
          initial={
            editing
              ? {
                  id: editing.id,
                  date: recordDate(editing),
                  time: editing.ridden_at ? toTimeString(new Date(editing.ridden_at)) : toTimeString(),
                  route_name: editing.route_name ?? '',
                  distance_mi: editing.distance_mi ?? '',
                  duration_min: editing.duration_min ?? '',
                  elevation_ft: editing.elevation_ft ?? '',
                  avg_hr: editing.avg_hr ?? '',
                  max_hr: editing.max_hr ?? '',
                  rpe: editing.rpe ?? null,
                  surface: editing.surface ?? '',
                  notes: editing.notes ?? '',
                  track: editing.track ?? null,
                }
              : prefill
          }
          onSave={handleSave}
          onCancel={() => {
            setMode('list')
            setEditing(null)
            setPrefill(null)
          }}
        />
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Rides</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Import a GPX file"
          >
            <Upload size={18} aria-hidden="true" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx,application/gpx+xml,application/xml,text/xml"
            onChange={handleGpxFile}
            style={{ display: 'none' }}
          />
          <button className="btn" onClick={() => setMode('record')} aria-label="Record ride with GPS">
            <Satellite size={18} aria-hidden="true" />
          </button>
          <button className="btn btn-primary" onClick={() => setMode('form')}>
            <Plus size={18} aria-hidden="true" /> Log
          </button>
        </div>
      </div>

      <StatGrid>
        <StatTile label="Rides" value={totals.rides} />
        <StatTile label="Distance" value={totals.distanceMi} unit="mi" />
        <StatTile label="Time" value={formatDuration(totals.durationMin)} />
        <StatTile label="Climbing" value={totals.elevationFt.toLocaleString()} unit="ft" />
      </StatGrid>

      {rides.length === 0 && (
        <EmptyState>
          No rides yet. Tap <strong>Log</strong> to enter one from your head unit, the satellite
          icon to record with GPS, or the upload icon to import a <strong>.gpx</strong> file
          exported from Strava, Garmin, or your head unit.
        </EmptyState>
      )}

      {weeks.map(([week, weekRides]) => {
        const weekDistance = weekRides.reduce((sum, r) => sum + (Number(r.distance_mi) || 0), 0)
        const weekLoad = weekRides.reduce((sum, r) => sum + (trainingLoad(r.rpe, r.duration_min) || 0), 0)

        return (
          <section key={week} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <h3 style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)' }}>
                Week of {formatShortDate(week)}
              </h3>
              <span className="muted">
                {weekRides.length} {weekRides.length === 1 ? 'ride' : 'rides'} ·{' '}
                {Math.round(weekDistance * 10) / 10} mi{weekLoad > 0 && ` · load ${weekLoad}`}
              </span>
            </div>

            {weekRides.map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                settings={settings}
                onEdit={() => {
                  setEditing(ride)
                  setMode('form')
                }}
                onDelete={() => handleDelete(ride)}
              />
            ))}
          </section>
        )
      })}
    </div>
  )
}

function RideCard({ ride, settings, onEdit, onDelete }) {
  // Null unless the track carries per-point heart rate, which is only true for
  // rides recorded with a strap or imported from a file that had it.
  const zones = useMemo(
    () => timeInZones(ride.track, settings.maxHr),
    [ride.track, settings.maxHr],
  )
  // Prefer the recorded column, but fall back to the track's own elevation.
  // Showing an em dash beside a profile that visibly climbs 200 ft is asking
  // the rider for a number the app is already holding.
  const climbFt = useMemo(() => {
    if (ride.elevation_ft != null && ride.elevation_ft !== '') return Number(ride.elevation_ft)
    const metres = elevationGainMeters(ride.track)
    return metres === null ? null : Math.round(metres * METERS_TO_FEET)
  }, [ride.elevation_ft, ride.track])

  const speed = avgSpeed(ride.distance_mi, ride.duration_min)
  const load = trainingLoad(ride.rpe, ride.duration_min)
  const zone = hrZone(ride.avg_hr, settings.maxHr)

  return (
    <article className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}>
            {ride.route_name || 'Untitled ride'}
          </strong>
          <div className="muted">
            {formatShortDate(recordDate(ride))}
            {ride.surface && ` · ${ride.surface.replace('-', ' ')}`}
            {ride.source && ` · via ${ride.source}`}
          </div>
          {ride.source && ride.rpe == null && (
            // Imported rides arrive without an RPE because no API can know how
            // hard something felt, and it carries most of the training-load
            // signal — so it is worth actively asking for.
            <button
              onClick={onEdit}
              style={{
                marginTop: 4,
                padding: '2px 8px',
                border: '1px solid var(--status-warn)',
                borderRadius: 999,
                background: 'none',
                color: 'var(--status-warn)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Add RPE
            </button>
          )}
        </div>
        <button className="btn" style={{ padding: 8, minHeight: 'var(--tap-target)' }} onClick={onEdit} aria-label="Edit ride">
          <Pencil size={16} aria-hidden="true" />
        </button>
        <button className="btn" style={{ padding: 8, minHeight: 'var(--tap-target)' }} onClick={onDelete} aria-label="Delete ride">
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Renders itself away unless the track carries per-point heart rate. */}
      {zones && <ZoneBar distribution={zones} />}

      {ride.track && <RouteMap track={ride.track} height={120} />}
      {/* Renders itself away on rides with no elevation, so older tracks and
          hand-entered rides are unaffected. */}
      {ride.track && <ElevationProfile points={ride.track} maxHr={settings?.maxHr} height={100} />}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))',
          gap: 8,
          fontSize: 'var(--text-sm)',
        }}
      >
        <Metric label="Distance" value={ride.distance_mi != null ? `${ride.distance_mi} mi` : '—'} />
        <Metric label="Time" value={ride.duration_min ? formatDuration(ride.duration_min) : '—'} />
        <Metric label="Speed" value={speed ? `${speed.toFixed(1)} mph` : '—'} />
        <Metric label="Climb" value={climbFt != null ? `${climbFt.toLocaleString()} ft` : '—'} />
        <Metric label="Avg HR" value={ride.avg_hr ? `${ride.avg_hr}` : '—'} color={zone?.color} />
        <Metric label="RPE" value={ride.rpe ?? '—'} />
        <Metric label="Load" value={load ?? '—'} />
      </div>

      {zone && (
        <span className="muted" style={{ color: zone.color }}>
          Zone {zone.zone} · {zone.label}
        </span>
      )}

      {ride.notes && (
        <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
          {ride.notes}
        </p>
      )}
    </article>
  )
}

function Metric({ label, value, color }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>
        {label}
      </div>
      <div style={{ fontWeight: 600, color: color ?? 'var(--color-text)' }}>{value}</div>
    </div>
  )
}
