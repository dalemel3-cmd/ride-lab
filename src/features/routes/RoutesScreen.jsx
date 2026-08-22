import { useMemo, useState, useRef } from 'react'
import {
  Plus,
  Trash2,
  Mountain,
  Navigation,
  Compass,
  Download,
  Upload,
  Play,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { saveRow, deleteRow, TABLES, queueLength } from '../../data/store.js'
import { avgSpeed } from '../../data/metrics.js'
import { parseGpx } from '../../data/gpx.js'
import { fireConfetti } from '../../components/confetti.js'
import { formatShortDate, formatDuration, recordDate } from '../../data/dates.js'
import { SURFACES, DIFFICULTIES, SEED_ROUTES } from '../../settings.js'
import { EmptyState } from '../../components/ui.jsx'
import SegmentsCard from './SegmentsCard.jsx'
import RouteMap from '../rides/RouteMap.jsx'

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

export default function RoutesScreen({
  routes,
  rides,
  settings,
  refresh,
  showToast,
  setPending,
  onNavigate,
}) {
  const [showForm, setShowForm] = useState(false)
  const [formInitial, setFormInitial] = useState(null)
  const [expandedCues, setExpandedCues] = useState({})
  const [categoryFilter, setCategoryFilter] = useState('all') // all | weekday | weekend
  const fileInputRef = useRef(null)

  const toggleCues = (id) => {
    setExpandedCues((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleSeedBenchmarkRoutes() {
    const existingNames = new Set(routes.map((r) => r.name.toLowerCase()))
    let added = 0
    for (const r of SEED_ROUTES) {
      if (!existingNames.has(r.name.toLowerCase())) {
        await saveRow(TABLES.routes, r)
        added++
      }
    }
    setPending(queueLength())
    fireConfetti({ particleCount: 60 })
    showToast(
      added > 0
        ? `Loaded ${added} Grand Blvd benchmark routes!`
        : 'All Grand Blvd benchmark routes are already in your library!',
    )
    refresh()
  }

  function handleGpxFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''

    const reader = new FileReader()
    reader.addEventListener('load', (e) => {
      try {
        const text = e.target.result
        const parsed = parseGpx(text)
        if (!parsed || !parsed.track || parsed.track.length === 0) {
          showToast('No usable GPS track found in that GPX file', 'error')
          return
        }

        const routeName =
          parsed.name ||
          file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ')

        setFormInitial({
          name: routeName,
          area: 'Bentonville / NWA',
          distance_mi: parsed.distanceMi != null ? parsed.distanceMi : '',
          elevation_ft: parsed.elevationFt != null ? parsed.elevationFt : '',
          surface: 'paved-trail',
          difficulty: 'green',
          notes: `Imported GPX route (${parsed.distanceMi || 0} mi, ${parsed.elevationFt || 0} ft climb).`,
          track: parsed.track,
        })
        setShowForm(true)
        fireConfetti({ particleCount: 50 })
        showToast(`Parsed GPX: "${routeName}" (${parsed.distanceMi} mi)`)
      } catch (err) {
        showToast(`Failed to parse GPX: ${err.message}`, 'error')
      }
    })
    reader.readAsText(file)
  }

  const filteredRoutes = useMemo(() => {
    if (categoryFilter === 'weekday') {
      return routes.filter((r) => {
        const dist = Number(r.distance_mi) || 0
        return dist >= 6 && dist <= 14.5
      })
    }
    if (categoryFilter === 'weekend') {
      return routes.filter((r) => {
        const dist = Number(r.distance_mi) || 0
        return dist > 14.5
      })
    }
    return routes
  }, [routes, categoryFilter])

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
    setFormInitial(null)
    refresh()
  }

  async function handleDelete(route) {
    if (!window.confirm(`Delete "${route.name}"? Rides already logged on it are kept.`)) return
    await deleteRow(TABLES.routes, route.id)
    setPending(queueLength())
    showToast('Route deleted')
    refresh()
  }

  function handleDownloadGpx(route) {
    const points = Array.isArray(route.track) ? route.track : []
    if (points.length === 0) {
      showToast('No GPS track available for this route', 'error')
      return
    }
    const trkpts = points
      .map(
        ([lat, lon, ele]) =>
          `      <trkpt lat="${lat}" lon="${lon}">${ele != null ? `<ele>${ele}</ele>` : ''}</trkpt>`,
      )
      .join('\n')

    const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Ride Lab" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${route.name}</name>
    <desc>${route.notes || ''}</desc>
  </metadata>
  <trk>
    <name>${route.name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`

    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${route.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.gpx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('GPX route downloaded')
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Routes & Navigation</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            onClick={handleSeedBenchmarkRoutes}
            title="Load Grand Blvd benchmark routes"
            style={{ fontSize: 'var(--text-xs)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Compass size={16} aria-hidden="true" />
            Seed Routes
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Import a GPX route file"
            title="Import GPX Route"
            style={{ fontSize: 'var(--text-xs)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Upload size={16} aria-hidden="true" />
            Import GPX
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx,application/gpx+xml,application/xml,text/xml"
            onChange={handleGpxFile}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setFormInitial(null)
              setShowForm((v) => !v)
            }}
            style={{ fontSize: 'var(--text-xs)' }}
          >
            <Plus size={16} aria-hidden="true" /> {showForm ? 'Close' : 'Add'}
          </button>
        </div>
      </div>

      {/* 1-TAP HERO GPX ROUTE DROPZONE */}
      <div
        className="gpx-hero-dropzone"
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(34, 211, 238, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Upload size={18} color="var(--color-accent)" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
              1-Tap Import GPX Route File
            </strong>
            <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
              Drop or choose a GPX from Strava, AllTrails, RideWithGPS, or Garmin
            </span>
          </div>
        </div>
        <span
          className="btn"
          style={{
            pointerEvents: 'none',
            fontSize: 'var(--text-xs)',
            padding: '4px 10px',
            whiteSpace: 'nowrap',
          }}
        >
          Select File
        </span>
      </div>

      {/* CATEGORY FILTER CHIPS */}
      <div className="filter-chips">
        <button
          type="button"
          className={`filter-chip ${categoryFilter === 'all' ? 'active' : ''}`}
          onClick={() => setCategoryFilter('all')}
        >
          All ({routes.length})
        </button>
        <button
          type="button"
          className={`filter-chip ${categoryFilter === 'weekday' ? 'active' : ''}`}
          onClick={() => setCategoryFilter('weekday')}
        >
          🎯 Weekday Benchmarks (10–14 mi)
        </button>
        <button
          type="button"
          className={`filter-chip ${categoryFilter === 'weekend' ? 'active' : ''}`}
          onClick={() => setCategoryFilter('weekend')}
        >
          🌲 Weekend Adventures (15+ mi)
        </button>
      </div>

      {showForm && (
        <RouteForm
          initial={formInitial}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false)
            setFormInitial(null)
          }}
        />
      )}

      {/* GPS-matched repeat efforts. Sits above the library because it needs no
          upkeep — segments appear on their own as tracked rides accumulate. */}
      <SegmentsCard rides={rides} maxHr={settings?.maxHr} />

      {filteredRoutes.length === 0 && !showForm && (
        <EmptyState>No routes match this filter. Add the trails you ride most.</EmptyState>
      )}

      {filteredRoutes.map((route) => {
        const routeRides = statsByRoute.get(route.name.toLowerCase()) ?? []
        // Oldest first, so "first vs. best" reads as progress.
        const chronological = [...routeRides].sort((a, b) =>
          a.ridden_at.localeCompare(b.ridden_at),
        )
        const fastest = routeRides.reduce((best, r) => {
          const speed = avgSpeed(r.distance_mi, r.duration_min)
          if (speed == null) return best
          return best == null || speed > best.speed ? { speed, ride: r } : best
        }, null)

        const originAddr = settings?.homeBase || '1105 SW Grand Blvd, Bentonville, AR'
        const destAddr = route.destination || `${route.name}, Bentonville, AR`
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
          originAddr,
        )}&destination=${encodeURIComponent(destAddr)}&travelmode=bicycling`

        const cues = Array.isArray(route.cues) ? route.cues : null
        const isCuesOpen = !!expandedCues[route.id]

        return (
          <article
            key={route.id}
            className="card"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}>
                  {route.name}
                </strong>
                <div className="muted">
                  {[
                    route.area,
                    route.distance_mi != null && `${route.distance_mi} mi`,
                    route.elevation_ft != null && `${route.elevation_ft} ft climb`,
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

            {/* Route Map Preview */}
            {Array.isArray(route.track) && route.track.length > 1 && (
              <RouteMap track={route.track} height={120} />
            )}

            {route.notes && (
              <p className="muted" style={{ margin: 0, fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>
                {route.notes}
              </p>
            )}

            {/* Turn-by-Turn Navigation Cue Sheet (Expandable) */}
            {cues && cues.length > 0 && (
              <div
                style={{
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--color-border)',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleCues(route.id)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Compass size={14} color="var(--color-accent)" />
                    Turn-by-Turn Cue Sheet ({cues.length} steps)
                  </span>
                  {isCuesOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {isCuesOpen && (
                  <div
                    style={{
                      padding: '8px 12px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      borderTop: '1px solid var(--color-border)',
                      fontSize: 'var(--text-xs)',
                      lineHeight: 1.4,
                    }}
                  >
                    {cues.map((cue, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: 'var(--color-surface-raised)',
                            color: 'var(--color-accent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {idx + 1}
                        </span>
                        <span className="muted">{cue}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ACTION BUTTONS: Google Maps Navigation + GPX Export + Record */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{
                  padding: '6px 12px',
                  fontSize: 'var(--text-xs)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  textDecoration: 'none',
                }}
              >
                <Navigation size={14} aria-hidden="true" />
                Navigate in Google Maps
              </a>

              {Array.isArray(route.track) && route.track.length > 1 && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleDownloadGpx(route)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 'var(--text-xs)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  title="Download GPX file for Garmin / Wahoo"
                >
                  <Download size={14} aria-hidden="true" />
                  GPX
                </button>
              )}

              {onNavigate && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => onNavigate('rides')}
                  style={{
                    padding: '6px 12px',
                    fontSize: 'var(--text-xs)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  title="Record a ride for this route"
                >
                  <Play size={14} aria-hidden="true" />
                  Record Ride
                </button>
              )}
            </div>

            {/* Progress / History Stats */}
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
                    {formatShortDate(recordDate(chronological[0]))}
                  </strong>
                </span>
                {fastest && (
                  <span className="muted">
                    Best{' '}
                    <strong style={{ color: 'var(--color-accent)' }}>
                      {fastest.speed.toFixed(1)} mph
                    </strong>
                    {fastest.ride.duration_min
                      ? ` (${formatDuration(fastest.ride.duration_min)})`
                      : ''}
                  </span>
                )}
              </div>
            ) : (
              <span
                className="muted"
                style={{
                  paddingTop: 6,
                  borderTop: '1px solid var(--color-border)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                Not ridden yet.
              </span>
            )}
          </article>
        )
      })}
    </div>
  )
}

function RouteForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({
    name: initial?.name ?? '',
    area: initial?.area ?? '',
    distance_mi: initial?.distance_mi ?? '',
    elevation_ft: initial?.elevation_ft ?? '',
    surface: initial?.surface ?? 'paved-trail',
    difficulty: initial?.difficulty ?? 'green',
    destination: initial?.destination ?? '',
    notes: initial?.notes ?? '',
    track: initial?.track ?? null,
  }))
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const num = (v) => (v === '' || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null)

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
        destination: form.destination || null,
        notes: form.notes || null,
        track: form.track || null,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-base)' }}>
          {initial?.track ? 'Review & Save Imported Route' : 'Add Custom Route'}
        </h3>
        {form.track && Array.isArray(form.track) && (
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--status-success)',
              background: 'rgba(52, 211, 153, 0.1)',
              padding: '2px 8px',
              borderRadius: 999,
              border: '1px solid rgba(52, 211, 153, 0.3)',
            }}
          >
            ✓ GPS Track Attached ({form.track.length} pts)
          </span>
        )}
      </div>

      <div className="field-grid">
        <div className="full">
          <label htmlFor="route_name">Name</label>
          <input id="route_name" required value={form.name} onChange={set('name')} />
        </div>
        <div className="full">
          <label htmlFor="area">Area / Region</label>
          <input id="area" placeholder="Bentonville, Rogers, Slaughter Pen, Coler…" value={form.area} onChange={set('area')} />
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
          <label htmlFor="route_destination">Destination / Trailhead Address</label>
          <input
            id="route_destination"
            placeholder="e.g. Mercy Trailhead, 5204 W Village Pkwy, Rogers, AR"
            value={form.destination}
            onChange={set('destination')}
          />
        </div>
        <div className="full">
          <label htmlFor="route_notes">Notes / Landmarks</label>
          <textarea id="route_notes" style={{ minHeight: 64 }} value={form.notes} onChange={set('notes')} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
          {busy ? 'Saving…' : 'Save route to library'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
