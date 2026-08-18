import { useMemo, useState } from 'react'
import { Plus, Trash2, Mountain } from 'lucide-react'
import { saveRow, deleteRow, TABLES, queueLength } from '../../data/store.js'
import { avgSpeed } from '../../data/metrics.js'
import { formatShortDate, formatDuration } from '../../data/dates.js'
import { SURFACES, DIFFICULTIES } from '../../settings.js'
import { EmptyState } from '../../components/ui.jsx'

/**
 * The route library, plus what riding each one has actually looked like.
 *
 * Per-route history is the cleanest progress signal available without a lab:
 * the same trail, the same climbs, ridden faster or at a lower heart rate. It
 * controls for terrain in a way that aggregate weekly numbers cannot.
 */

const DIFFICULTY_COLORS = {
  green: 'var(--status-success)',
  blue: 'var(--zone-1)',
  black: 'var(--color-text)',
  'double-black': 'var(--status-error)',
}

export default function RoutesScreen({ routes, rides, refresh, showToast, setPending }) {
  const [showForm, setShowForm] = useState(false)

  // Match rides to routes by name — the ride form writes a free-text
  // `route_name`, so a route can be typed in without existing in the library.
  const statsByRoute = useMemo(() => {
    const map = new Map()
    for (const ride of rides) {
      if (!ride.route_name) continue
      const key = ride.route_name.toLowerCase()
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(ride)
    }
    return map
  }, [rides])

  async function handleSave(record) {
    const { synced } = await saveRow(TABLES.routes, record)
    setPending(queueLength())
    showToast(synced ? 'Route saved' : 'Saved on device — will sync when back online')
    setShowForm(false)
    refresh()
  }

  async function handleDelete(route) {
    if (!window.confirm(`Delete "${route.name}"? Rides already logged on it are kept.`)) return
    await deleteRow(TABLES.routes, route.id)
    setPending(queueLength())
    showToast('Route deleted')
    refresh()
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Routes</h2>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          <Plus size={18} aria-hidden="true" /> {showForm ? 'Close' : 'Add'}
        </button>
      </div>

      {showForm && <RouteForm onSave={handleSave} onCancel={() => setShowForm(false)} />}

      {routes.length === 0 && !showForm && (
        <EmptyState>No routes yet. Add the trails you ride most.</EmptyState>
      )}

      {routes.map((route) => {
        const routeRides = statsByRoute.get(route.name.toLowerCase()) ?? []
        // Oldest first, so "first vs. best" reads as progress.
        const chronological = [...routeRides].sort((a, b) => a.ridden_at.localeCompare(b.ridden_at))
        const fastest = routeRides.reduce((best, r) => {
          const speed = avgSpeed(r.distance_mi, r.duration_min)
          if (speed == null) return best
          return best == null || speed > best.speed ? { speed, ride: r } : best
        }, null)

        return (
          <article key={route.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}>
                  {route.name}
                </strong>
                <div className="muted">
                  {[
                    route.area,
                    route.distance_mi != null && `${route.distance_mi} mi`,
                    route.elevation_ft != null && `${route.elevation_ft} ft`,
                    route.surface?.replace('-', ' '),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              {route.difficulty && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    color: DIFFICULTY_COLORS[route.difficulty] ?? 'var(--color-text-muted)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  <Mountain size={14} aria-hidden="true" />
                  {route.difficulty.replace('-', ' ')}
                </span>
              )}
              <button
                className="btn"
                style={{ padding: 8 }}
                onClick={() => handleDelete(route)}
                aria-label={`Delete ${route.name}`}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>

            {route.notes && (
              <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
                {route.notes}
              </p>
            )}

            {routeRides.length > 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 14,
                  paddingTop: 8,
                  borderTop: '1px solid var(--color-border)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <span className="muted">
                  Ridden <strong style={{ color: 'var(--color-text)' }}>{routeRides.length}×</strong>
                </span>
                <span className="muted">
                  First{' '}
                  <strong style={{ color: 'var(--color-text)' }}>
                    {formatShortDate(chronological[0].ridden_at.slice(0, 10))}
                  </strong>
                </span>
                {fastest && (
                  <span className="muted">
                    Best{' '}
                    <strong style={{ color: 'var(--color-accent)' }}>
                      {fastest.speed.toFixed(1)} mph
                    </strong>
                    {fastest.ride.duration_min ? ` (${formatDuration(fastest.ride.duration_min)})` : ''}
                  </span>
                )}
              </div>
            ) : (
              <span className="muted" style={{ paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
                Not ridden yet.
              </span>
            )}
          </article>
        )
      })}
    </div>
  )
}

function RouteForm({ onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '',
    area: '',
    distance_mi: '',
    elevation_ft: '',
    surface: 'singletrack',
    difficulty: 'blue',
    notes: '',
  })
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const num = (v) => (v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy || !form.name.trim()) return
    setBusy(true)
    try {
      await onSave({
        name: form.name.trim(),
        area: form.area || null,
        distance_mi: num(form.distance_mi),
        elevation_ft: num(form.elevation_ft),
        surface: form.surface || null,
        difficulty: form.difficulty || null,
        notes: form.notes || null,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="field-grid">
        <div className="full">
          <label htmlFor="route_name">Name</label>
          <input id="route_name" required value={form.name} onChange={set('name')} />
        </div>
        <div className="full">
          <label htmlFor="area">Area</label>
          <input id="area" placeholder="Slaughter Pen, Coler, Bella Vista…" value={form.area} onChange={set('area')} />
        </div>
        <div>
          <label htmlFor="route_distance">Distance (mi)</label>
          <input id="route_distance" type="number" inputMode="decimal" step="0.1" value={form.distance_mi} onChange={set('distance_mi')} />
        </div>
        <div>
          <label htmlFor="route_elevation">Elevation (ft)</label>
          <input id="route_elevation" type="number" inputMode="numeric" step="1" value={form.elevation_ft} onChange={set('elevation_ft')} />
        </div>
        <div>
          <label htmlFor="route_surface">Surface</label>
          <select id="route_surface" value={form.surface} onChange={set('surface')}>
            {SURFACES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="route_difficulty">Difficulty</label>
          <select id="route_difficulty" value={form.difficulty} onChange={set('difficulty')}>
            {DIFFICULTIES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div className="full">
          <label htmlFor="route_notes">Notes</label>
          <textarea id="route_notes" style={{ minHeight: 64 }} value={form.notes} onChange={set('notes')} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
          {busy ? 'Saving…' : 'Save route'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
