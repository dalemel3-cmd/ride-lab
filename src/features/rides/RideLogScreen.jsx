import { useMemo, useState } from 'react'
import { Plus, Satellite, Trash2, Pencil } from 'lucide-react'
import { saveRow, deleteRow, TABLES, queueLength } from '../../data/store.js'
import { avgSpeed, trainingLoad, hrZone, summarize } from '../../data/metrics.js'
import { formatDuration, formatShortDate, toDateString, toTimeString, startOfWeek, recordDate } from '../../data/dates.js'
import { StatGrid, StatTile, EmptyState } from '../../components/ui.jsx'
import RideForm from './RideForm.jsx'
import RecordRide from './RecordRide.jsx'
import RouteMap from './RouteMap.jsx'

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

  const totals = useMemo(() => summarize(rides), [rides])

  const weeks = useMemo(() => {
    const grouped = new Map()
    for (const ride of rides) {
      const week = startOfWeek(toDateString(new Date(ride.ridden_at)))
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
    if (!window.confirm(`Delete the ${formatShortDate(toDateString(new Date(ride.ridden_at)))} ride?`)) {
      return
    }
    await deleteRow(TABLES.rides, ride.id)
    setPending(queueLength())
    showToast('Ride deleted')
    refresh()
  }

  function handleRecordingFinished({ track, distanceMi, durationMin }) {
    // Hand the measured numbers to the manual form so HR and RPE — the things
    // GPS can't know — get filled in while the ride is still fresh.
    setPrefill({
      date: toDateString(),
      time: toTimeString(),
      distance_mi: distanceMi,
      duration_min: durationMin,
      track,
    })
    setMode('form')
  }

  if (mode === 'record') {
    return (
      <div className="screen">
        <div className="screen-header">
          <h2>Record ride</h2>
        </div>
        <RecordRide onFinish={handleRecordingFinished} onCancel={() => setMode('list')} />
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
                  date: toDateString(new Date(editing.ridden_at)),
                  time: toTimeString(new Date(editing.ridden_at)),
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
          No rides yet. Tap <strong>Log</strong> to enter one from your head unit, or the satellite
          icon to record with GPS.
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

      {ride.track && <RouteMap track={ride.track} height={120} />}

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
        <Metric label="Climb" value={ride.elevation_ft != null ? `${ride.elevation_ft} ft` : '—'} />
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
