import { useState } from 'react'
import { RpePicker } from '../../components/ui.jsx'
import { SURFACES } from '../../settings.js'
import { toDateString, toTimeString, wallTimeToISO } from '../../data/dates.js'

/**
 * Manual ride entry — the primary logging path.
 *
 * Everything except the date is optional on purpose: a half-logged ride is
 * infinitely more useful than a skipped one, and the analytics all tolerate
 * nulls. The one field worth nagging about is RPE, since it costs nothing to
 * record and carries most of the training-load signal.
 */
export default function RideForm({ routes, settings, initial, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({
    date: initial?.date ?? toDateString(),
    time: initial?.time ?? toTimeString(),
    route_name: initial?.route_name ?? '',
    distance_mi: initial?.distance_mi ?? '',
    duration_min: initial?.duration_min ?? '',
    elevation_ft: initial?.elevation_ft ?? '',
    avg_hr: initial?.avg_hr ?? '',
    max_hr: initial?.max_hr ?? '',
    rpe: initial?.rpe ?? null,
    surface: initial?.surface ?? settings.defaultSurface,
    notes: initial?.notes ?? '',
  }))
  const [busy, setBusy] = useState(false)

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  // Empty string must become null, not 0 — a ride with no recorded heart rate
  // is not a ride at 0 bpm, and averaging zeros would poison every trend.
  const num = (value) => {
    if (value === '' || value === null || value === undefined) return null
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  function handleRouteChange(event) {
    const name = event.target.value
    const match = routes.find((r) => r.name === name)
    // `||` would treat a typed 0 as empty and overwrite it — rare for distance,
    // but entirely normal for elevation on the flat Greenway.
    const keepOrFill = (current, fallback) => (current === '' || current === null || current === undefined ? (fallback ?? '') : current)

    setForm((f) => ({
      ...f,
      route_name: name,
      // Prefill from the route library, but never overwrite something typed.
      distance_mi: keepOrFill(f.distance_mi, match?.distance_mi),
      elevation_ft: keepOrFill(f.elevation_ft, match?.elevation_ft),
      surface: match?.surface ?? f.surface,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)

    try {
      await onSave({
        ...(initial?.id ? { id: initial.id } : {}),
        ridden_at: wallTimeToISO(form.date, form.time),
        route_name: form.route_name || null,
        distance_mi: num(form.distance_mi),
        duration_min: num(form.duration_min),
        elevation_ft: num(form.elevation_ft),
        avg_hr: num(form.avg_hr),
        max_hr: num(form.max_hr),
        rpe: form.rpe ? Number(form.rpe) : null,
        surface: form.surface || null,
        notes: form.notes || null,
        ...(initial?.track ? { track: initial.track } : {}),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="field-grid">
        <div>
          <label htmlFor="date">Date</label>
          <input id="date" type="date" required value={form.date} onChange={set('date')} />
        </div>
        <div>
          <label htmlFor="time">Start time</label>
          <input id="time" type="time" value={form.time} onChange={set('time')} />
        </div>

        <div className="full">
          <label htmlFor="route">Route</label>
          <input
            id="route"
            list="route-options"
            placeholder="Pick one or type a new route"
            value={form.route_name}
            onChange={handleRouteChange}
          />
          <datalist id="route-options">
            {routes.map((r) => (
              <option key={r.id} value={r.name} />
            ))}
          </datalist>
        </div>

        <div>
          <label htmlFor="distance">Distance (mi)</label>
          <input
            id="distance"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={form.distance_mi}
            onChange={set('distance_mi')}
          />
        </div>
        <div>
          <label htmlFor="duration">Duration (min)</label>
          <input
            id="duration"
            type="number"
            inputMode="decimal"
            step="1"
            min="0"
            value={form.duration_min}
            onChange={set('duration_min')}
          />
        </div>

        <div>
          <label htmlFor="elevation">Elevation (ft)</label>
          <input
            id="elevation"
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            value={form.elevation_ft}
            onChange={set('elevation_ft')}
          />
        </div>
        <div>
          <label htmlFor="surface">Surface</label>
          <select id="surface" value={form.surface ?? ''} onChange={set('surface')}>
            <option value="">—</option>
            {SURFACES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="avg_hr">Avg HR (bpm)</label>
          <input
            id="avg_hr"
            type="number"
            inputMode="numeric"
            step="1"
            min="30"
            max="240"
            value={form.avg_hr}
            onChange={set('avg_hr')}
          />
        </div>
        <div>
          <label htmlFor="max_hr">Max HR (bpm)</label>
          <input
            id="max_hr"
            type="number"
            inputMode="numeric"
            step="1"
            min="30"
            max="240"
            value={form.max_hr}
            onChange={set('max_hr')}
          />
        </div>
      </div>

      <RpePicker value={form.rpe} onChange={(rpe) => setForm((f) => ({ ...f, rpe }))} />

      <div>
        <label htmlFor="notes">Notes</label>
        <textarea
          id="notes"
          placeholder="Conditions, how the bike felt, what you worked on…"
          value={form.notes}
          onChange={set('notes')}
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
          {busy ? 'Saving…' : initial?.id ? 'Update ride' : 'Save ride'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
