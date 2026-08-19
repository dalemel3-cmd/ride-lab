import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { saveRow, deleteRow, TABLES, queueLength } from '../../data/store.js'
import { toDateString, formatShortDate, recordDate } from '../../data/dates.js'
import { ScalePicker, EmptyState } from '../../components/ui.jsx'

/**
 * The subjective half of the study.
 *
 * Mood, energy and soreness are the numbers that explain the other numbers — a
 * week of flat power or a spike in resting HR usually shows up here first as
 * poor sleep or lingering soreness. Linking an entry to a ride is what makes
 * that connection legible months later.
 */

const SCALE_HINTS = {
  mood: ['Low', 'Great'],
  energy: ['Drained', 'Fresh'],
  soreness: ['None', 'Very sore'],
}

export default function JournalScreen({ journal, rides, refresh, showToast, setPending }) {
  const [showForm, setShowForm] = useState(false)

  // Recent rides only: the picker exists to attach an entry to a ride you
  // actually just did, not to scroll four months of history.
  const recentRides = useMemo(() => rides.slice(0, 15), [rides])
  const ridesById = useMemo(() => new Map(rides.map((r) => [r.id, r])), [rides])

  // Group entries by month for the notebook view
  const byMonth = useMemo(() => {
    const groups = new Map()
    for (const entry of journal) {
      // Parse YYYY-MM-DD as UTC to avoid local timezone shifts changing the month
      const date = new Date(`${entry.entry_date}T00:00:00Z`)
      const monthStr = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      if (!groups.has(monthStr)) groups.set(monthStr, [])
      groups.get(monthStr).push(entry)
    }
    return [...groups.entries()]
  }, [journal])

  async function handleSave(record) {
    const { synced } = await saveRow(TABLES.journal, record)
    setPending(queueLength())
    showToast(synced ? 'Entry saved' : 'Saved on device — will sync when back online')
    setShowForm(false)
    refresh()
  }

  async function handleDelete(entry) {
    if (!window.confirm(`Delete the ${formatShortDate(entry.entry_date)} entry?`)) return
    await deleteRow(TABLES.journal, entry.id)
    setPending(queueLength())
    showToast('Entry deleted')
    refresh()
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Journal</h2>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          <Plus size={18} aria-hidden="true" /> {showForm ? 'Close' : 'Write'}
        </button>
      </div>

      {showForm && (
        <JournalForm rides={recentRides} onSave={handleSave} onCancel={() => setShowForm(false)} />
      )}

      {journal.length === 0 && !showForm && (
        <EmptyState>
          Nothing written yet. Two minutes after a ride is worth more than an hour of remembering
          later — how the legs felt, what the bike did, what surprised you.
        </EmptyState>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {byMonth.map(([month, entries]) => (
          <details
            key={month}
            className="card"
            style={{ padding: 0, overflow: 'hidden', transition: 'all 0.2s ease-out' }}
          >
            <summary
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 'var(--text-lg)',
                userSelect: 'none',
                background: 'var(--color-surface)',
              }}
            >
              <span>{month}</span>
              <span className="muted" style={{ fontSize: 'var(--text-sm)', fontWeight: 400 }}>
                {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
              </span>
            </summary>

            <div
              style={{
                padding: '0 16px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                borderTop: '1px solid var(--color-border)',
                marginTop: 4,
                paddingTop: 16,
              }}
            >
              {entries.map((entry) => {
                const ride = entry.ride_id ? ridesById.get(entry.ride_id) : null
                return (
                  <article key={entry.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}>
                          {formatShortDate(entry.entry_date)}
                        </strong>
                        {ride && <div className="muted">after {ride.route_name || 'a ride'}</div>}
                      </div>
                      <button
                        className="btn"
                        style={{ padding: 8 }}
                        onClick={() => handleDelete(entry)}
                        aria-label="Delete entry"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 'var(--text-sm)' }}>
                      {entry.mood != null && <Chip label="Mood" value={entry.mood} />}
                      {entry.energy != null && <Chip label="Energy" value={entry.energy} />}
                      {entry.soreness != null && <Chip label="Soreness" value={entry.soreness} />}
                      {entry.sleep_hrs != null && <Chip label="Sleep" value={`${entry.sleep_hrs}h`} />}
                    </div>

                    {entry.body && (
                      <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{entry.body}</p>
                    )}
                    
                    {/* Visual separator for entries in the same month except the last one */}
                    <div style={{ height: 1, background: 'var(--color-border)', marginTop: 8, opacity: 0.5 }} />
                  </article>
                )
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

function Chip({ label, value }) {
  return (
    <span className="muted">
      {label}: <strong style={{ color: 'var(--color-text)' }}>{value}</strong>
    </span>
  )
}

function JournalForm({ rides, onSave, onCancel }) {
  const [form, setForm] = useState({
    entry_date: toDateString(),
    ride_id: '',
    mood: null,
    energy: null,
    soreness: null,
    sleep_hrs: '',
    body: '',
  })
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      await onSave({
        entry_date: form.entry_date,
        ride_id: form.ride_id || null,
        mood: form.mood,
        energy: form.energy,
        soreness: form.soreness,
        sleep_hrs: form.sleep_hrs === '' ? null : Number(form.sleep_hrs),
        body: form.body || null,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="field-grid">
        <div>
          <label htmlFor="entry_date">Date</label>
          <input
            id="entry_date"
            type="date"
            required
            value={form.entry_date}
            onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))}
          />
        </div>
        <div>
          <label htmlFor="sleep">Sleep (hrs)</label>
          <input
            id="sleep"
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            max="24"
            value={form.sleep_hrs}
            onChange={(e) => setForm((f) => ({ ...f, sleep_hrs: e.target.value }))}
          />
        </div>
        <div className="full">
          <label htmlFor="ride_link">Link to a ride</label>
          <select
            id="ride_link"
            value={form.ride_id}
            onChange={(e) => setForm((f) => ({ ...f, ride_id: e.target.value }))}
          >
            <option value="">Not about a specific ride</option>
            {rides.map((r) => (
              <option key={r.id} value={r.id}>
                {formatShortDate(recordDate(r))} — {r.route_name || 'Untitled ride'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ScalePicker
        id="mood"
        label="Mood"
        value={form.mood}
        onChange={(mood) => setForm((f) => ({ ...f, mood }))}
        lowLabel={SCALE_HINTS.mood[0]}
        highLabel={SCALE_HINTS.mood[1]}
      />
      <ScalePicker
        id="energy"
        label="Energy"
        value={form.energy}
        onChange={(energy) => setForm((f) => ({ ...f, energy }))}
        lowLabel={SCALE_HINTS.energy[0]}
        highLabel={SCALE_HINTS.energy[1]}
      />
      <ScalePicker
        id="soreness"
        label="Soreness"
        value={form.soreness}
        onChange={(soreness) => setForm((f) => ({ ...f, soreness }))}
        lowLabel={SCALE_HINTS.soreness[0]}
        highLabel={SCALE_HINTS.soreness[1]}
      />

      <div>
        <label htmlFor="body">How did it feel?</label>
        <textarea
          id="body"
          placeholder="What worked, what hurt, what clicked. Anything you would want to remember in four months."
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
          {busy ? 'Saving…' : 'Save entry'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
