import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Flag } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { saveRow, deleteRow, TABLES, queueLength } from '../../data/store.js'
import { trendDelta, estimateVo2Max, preTrainingHrv } from '../../data/metrics.js'
import { toDateString, formatShortDate } from '../../data/dates.js'
import { StatGrid, StatTile, EmptyState, ScienceNote } from '../../components/ui.jsx'
import PhotoLog from './PhotoLog.jsx'

/**
 * Body composition over the study.
 *
 * The headline is Baseline vs. Now, not the latest reading. A single weigh-in
 * says nothing — day-to-day swings of a few pounds are water, not tissue. The
 * comparison against a fixed baseline is the only honest way to read four
 * months of numbers.
 */

const METRICS = [
  { key: 'weight_lbs', label: 'Weight', unit: 'lbs', lowerIsBetter: true },
  { key: 'body_fat_pct', label: 'Body fat', unit: '%', lowerIsBetter: true },
  { key: 'waist_in', label: 'Waist', unit: 'in', lowerIsBetter: true },
  { key: 'resting_hr', label: 'Resting HR', unit: 'bpm', lowerIsBetter: true },
  { key: 'hrv_ms', label: 'HRV', unit: 'ms', lowerIsBetter: false },
]

export default function BodyCompScreen({ bodyComp, rides = [], settings, refresh, showToast, setPending }) {
  const [showForm, setShowForm] = useState(false)

  // The store hands back newest-first; charts and trends need oldest-first.
  const chronological = useMemo(
    () => [...bodyComp].sort((a, b) => a.measured_at.localeCompare(b.measured_at)),
    [bodyComp],
  )

  // If several rows somehow carry the flag, the earliest wins — a baseline is
  // where the study started, so picking the newest (which newest-first order
  // would do) would silently shrink every reported change.
  const baseline = useMemo(
    () => chronological.find((m) => m.is_baseline) ?? chronological[0] ?? null,
    [chronological],
  )
  const latest = chronological[chronological.length - 1] ?? null

  /**
   * HRV gets its own reference, because the baseline row does not work for it.
   *
   * Weight and waist do not care that the baseline day happened to be a hard
   * ride. HRV does — it drops sharply the night after a big effort, and if the
   * study was baselined on a benchmark day, that single suppressed reading
   * becomes the number every later night is measured against. Here it turned a
   * flat HRV trend into a reported 63% gain.
   */
  const hrvReference = useMemo(() => preTrainingHrv(chronological, rides), [chronological, rides])

  const chartData = chronological.map((m) => ({
    date: formatShortDate(m.measured_at),
    weight_lbs: m.weight_lbs != null ? Number(m.weight_lbs) : null,
    body_fat_pct: m.body_fat_pct != null ? Number(m.body_fat_pct) : null,
    waist_in: m.waist_in != null ? Number(m.waist_in) : null,
    resting_hr: m.resting_hr != null ? Number(m.resting_hr) : null,
    hrv_ms: m.hrv_ms != null ? Number(m.hrv_ms) : null,
  }))

  /**
   * A measured VO2 max beats an estimated one, and the two are never mixed.
   *
   * The estimate is Uth–Sørensen applied to resting heart rate; the measurement
   * comes from the watch. Silently swapping between them across the study would
   * make a change of method look like a change of fitness — so a comparison
   * uses one source throughout, and the label says which.
   */
  const vo2 = useMemo(() => {
    const measuredRows = chronological.filter((m) => m.vo2_max != null)
    if (measuredRows.length > 0) {
      const first = measuredRows[0]
      const last = measuredRows[measuredRows.length - 1]
      return {
        measured: true,
        baseline: Number(first.vo2_max),
        latest: Number(last.vo2_max),
      }
    }
    return {
      measured: false,
      baseline: baseline ? estimateVo2Max(baseline.resting_hr, settings.maxHr) : null,
      latest: latest ? estimateVo2Max(latest.resting_hr, settings.maxHr) : null,
    }
  }, [chronological, baseline, latest, settings.maxHr])

  const vo2Baseline = vo2.baseline
  const vo2Latest = vo2.latest

  // A deliberately-marked baseline, as opposed to the oldest-row fallback above.
  const hasExplicitBaseline = bodyComp.some((m) => m.is_baseline)
  const [baselineChoice, setBaselineChoice] = useState('')

  // Default the picker to the most recent measurement: someone setting a
  // baseline now is almost always starting the study now, not backdating it.
  useEffect(() => {
    if (!baselineChoice && latest) setBaselineChoice(latest.id)
  }, [baselineChoice, latest])

  async function handleSetBaseline() {
    const chosen = bodyComp.find((m) => m.id === baselineChoice)
    if (!chosen) return
    // Reuses handleSave so the "exactly one baseline" rule stays in one place.
    await handleSave({ ...chosen, is_baseline: true })
    showToast(`Baseline set to ${formatShortDate(chosen.measured_at)}`)
  }

  async function handleSave(record) {
    // Exactly one baseline, always. Marking a new one clears the old, because
    // two flagged rows make "Baseline vs. now" depend on iteration order rather
    // than on a decision the rider made.
    if (record.is_baseline) {
      const previous = bodyComp.filter((m) => m.is_baseline && m.id !== record.id)
      for (const row of previous) {
        await saveRow(TABLES.bodyComp, { ...row, is_baseline: false })
      }
    }

    const { synced } = await saveRow(TABLES.bodyComp, record)
    setPending(queueLength())
    showToast(synced ? 'Measurement saved' : 'Saved on device — will sync when back online')
    setShowForm(false)
    refresh()
  }

  async function handleDelete(entry) {
    if (!window.confirm(`Delete the ${formatShortDate(entry.measured_at)} measurement?`)) return
    await deleteRow(TABLES.bodyComp, entry.id)
    setPending(queueLength())
    showToast('Measurement deleted')
    refresh()
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Body</h2>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          <Plus size={18} aria-hidden="true" /> {showForm ? 'Close' : 'Measure'}
        </button>
      </div>

      {showForm && (
        <BodyForm
          hasBaseline={Boolean(bodyComp.some((m) => m.is_baseline))}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}

      {bodyComp.length === 0 && !showForm && (
        <EmptyState>
          No measurements yet. Take a baseline now — everything in this study is measured against
          it, and you only get one chance to record where you started.
        </EmptyState>
      )}

      {/*
        Imported measurements never set is_baseline — which day starts the study
        is the rider's call, not an API's. But nothing said so, and a synced
        account ends up with dozens of rows and no baseline, silently comparing
        against whichever happens to be oldest. That is usually not the intended
        start, and every trend on this screen inherits the mistake.
      */}
      {!hasExplicitBaseline && chronological.length > 1 && (
        <section
          className="card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            borderLeft: '4px solid var(--status-warn)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Flag size={16} color="var(--status-warn)" aria-hidden="true" />
            <strong style={{ fontSize: 'var(--text-sm)' }}>No study baseline set</strong>
          </div>
          <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
            You have {chronological.length} measurements, none marked as the start of the study.
            Every comparison below is falling back to the oldest one
            {baseline ? ` (${formatShortDate(baseline.measured_at)})` : ''}, which may be well
            before you started riding. Pick the day the study actually begins.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              aria-label="Choose the study baseline measurement"
              value={baselineChoice}
              onChange={(e) => setBaselineChoice(e.target.value)}
              style={{ flex: '1 1 180px', minWidth: 0 }}
            >
              {chronological.map((m) => (
                <option key={m.id} value={m.id}>
                  {formatShortDate(m.measured_at)}
                  {m.weight_lbs != null ? ` · ${m.weight_lbs} lb` : ''}
                  {m.resting_hr != null ? ` · ${m.resting_hr} bpm` : ''}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={handleSetBaseline} disabled={!baselineChoice}>
              Set baseline
            </button>
          </div>
        </section>
      )}

      {baseline && latest && baseline.id !== latest.id && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 'var(--text-lg)' }}>Baseline vs. now</h3>
          <StatGrid>
            {METRICS.map((metric) => {
              const usePreTraining = metric.key === 'hrv_ms' && hrvReference
              const from = usePreTraining
                ? hrvReference.ms
                : baseline[metric.key] ?? chronological.find((m) => m[metric.key] != null)?.[metric.key]
              const to = latest[metric.key]
              if (from == null || to == null) return null
              const delta = trendDelta([from, to], { lowerIsBetter: metric.lowerIsBetter })
              if (!delta) return null
              return (
                <StatTile
                  key={metric.key}
                  label={metric.label}
                  value={to}
                  unit={metric.unit}
                  tone={delta.improved ? 'good' : 'bad'}
                  hint={
                    usePreTraining
                      ? `${delta.change > 0 ? '+' : ''}${delta.change} from ${from} (${hrvReference.nights}-night pre-training mean)`
                      : `${delta.change > 0 ? '+' : ''}${delta.change} from ${from}`
                  }
                />
              )
            })}
            {vo2Baseline && vo2Latest && (
              <StatTile
                label={vo2.measured ? 'VO2 max' : 'Est. VO2 max'}
                value={vo2Latest}
                unit="ml/kg/min"
                tone={vo2Latest > vo2Baseline ? 'good' : undefined}
                hint={`from ${vo2Baseline}`}
              />
            )}
          </StatGrid>

          {hrvReference && (
            <ScienceNote title="Why HRV uses a different reference">
              HRV is compared against the mean of the {hrvReference.nights} night
              {hrvReference.nights === 1 ? '' : 's'} before the first logged ride
              ({formatShortDate(hrvReference.from)}
              {hrvReference.from !== hrvReference.to && ` – ${formatShortDate(hrvReference.to)}`}),
              not against the baseline measurement. rMSSD falls sharply the night after a hard
              effort, so if the baseline day involved a real ride, that reading records the ride
              rather than the resting state — and every later night then gets measured against an
              artificially low number.
              {!hrvReference.established &&
                ' Only one night sits before the first ride, so treat this reference as provisional.'}
            </ScienceNote>
          )}

          <ScienceNote title="What this means">
            Resting heart rate is the most telling number here. As endurance training thickens the
            left ventricle and increases blood plasma volume, the heart moves more blood per beat —
            so it needs fewer beats to do the same job at rest. A drop of 5–10 bpm over a few months
            of consistent riding is a real, measurable adaptation, and it usually shows up before
            any change on the scale.
          </ScienceNote>
        </section>
      )}

      {chartData.length > 1 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {METRICS.map((metric) => {
            const series = chartData.filter((d) => d[metric.key] != null)
            if (series.length < 2) return null
            return (
              <div key={metric.key} className="card">
                <h3 style={{ fontSize: 'var(--text-base)', marginBottom: 12 }}>
                  {metric.label} ({metric.unit})
                </h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={series} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      stroke="var(--color-text-muted)"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      stroke="var(--color-text-muted)"
                      tick={{ fontSize: 11 }}
                      domain={['dataMin - 2', 'dataMax + 2']}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                        color: 'var(--color-text)',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey={metric.key}
                      name={metric.label}
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )
          })}
        </section>
      )}

      <PhotoLog showToast={showToast} />

      {bodyComp.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <details>
            <summary style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '8px 0', userSelect: 'none' }}>
              History ({bodyComp.length} {bodyComp.length === 1 ? 'entry' : 'entries'})
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {bodyComp.map((entry) => (
                <div
                  key={entry.id}
                  className="card"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{formatShortDate(entry.measured_at)}</strong>
                    {entry.is_baseline && (
                      <span
                        style={{
                          marginLeft: 8,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'var(--color-accent)',
                          color: 'var(--navy-950)',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 700,
                        }}
                      >
                        BASELINE
                      </span>
                    )}
                    <div className="muted">
                      {[
                        entry.weight_lbs != null && `${entry.weight_lbs} lbs`,
                        entry.body_fat_pct != null && `${entry.body_fat_pct}% bf`,
                        entry.waist_in != null && `${entry.waist_in}" waist`,
                        entry.resting_hr != null && `${entry.resting_hr} bpm rest`,
                        entry.hrv_ms != null && `${entry.hrv_ms} ms hrv`,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'No values recorded'}
                    </div>
                  </div>
                  <button
                    className="btn"
                    style={{ padding: 8 }}
                    onClick={() => handleDelete(entry)}
                    aria-label="Delete measurement"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </details>
        </section>
      )}
    </div>
  )
}

function BodyForm({ hasBaseline, onSave, onCancel }) {
  const [form, setForm] = useState({
    measured_at: toDateString(),
    weight_lbs: '',
    body_fat_pct: '',
    waist_in: '',
    hip_in: '',
    resting_hr: '',
    hrv_ms: '',
    // The first measurement is the baseline unless one already exists.
    is_baseline: !hasBaseline,
    notes: '',
  })
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const num = (v) => (v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      await onSave({
        measured_at: form.measured_at,
        weight_lbs: num(form.weight_lbs),
        body_fat_pct: num(form.body_fat_pct),
        waist_in: num(form.waist_in),
        hip_in: num(form.hip_in),
        resting_hr: num(form.resting_hr),
        hrv_ms: num(form.hrv_ms),
        is_baseline: form.is_baseline,
        notes: form.notes || null,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ScienceNote title="For comparable numbers">
        Measure first thing in the morning, after using the bathroom, before eating or drinking, in
        the same clothes. Body weight swings 2–4 lbs a day on water alone — consistency in how you
        measure matters more than precision in what you measure with.
      </ScienceNote>

      <div className="field-grid">
        <div className="full">
          <label htmlFor="measured_at">Date</label>
          <input id="measured_at" type="date" required value={form.measured_at} onChange={set('measured_at')} />
        </div>
        <div>
          <label htmlFor="weight">Weight (lbs)</label>
          <input id="weight" type="number" inputMode="decimal" step="0.1" value={form.weight_lbs} onChange={set('weight_lbs')} />
        </div>
        <div>
          <label htmlFor="bf">Body fat (%)</label>
          <input id="bf" type="number" inputMode="decimal" step="0.1" value={form.body_fat_pct} onChange={set('body_fat_pct')} />
        </div>
        <div>
          <label htmlFor="waist">Waist (in)</label>
          <input id="waist" type="number" inputMode="decimal" step="0.1" value={form.waist_in} onChange={set('waist_in')} />
        </div>
        <div>
          <label htmlFor="hip">Hip (in)</label>
          <input id="hip" type="number" inputMode="decimal" step="0.1" value={form.hip_in} onChange={set('hip_in')} />
        </div>
        <div className="full">
          <label htmlFor="rhr">Resting HR (bpm)</label>
          <input id="rhr" type="number" inputMode="numeric" step="1" value={form.resting_hr} onChange={set('resting_hr')} />
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Taken lying down, before getting out of bed.
          </p>
        </div>
        <div className="full">
          <label htmlFor="hrv">HRV (ms)</label>
          <input id="hrv" type="number" inputMode="numeric" step="1" value={form.hrv_ms} onChange={set('hrv_ms')} />
        </div>
        <div className="full">
          <label htmlFor="bodynotes">Notes</label>
          <textarea id="bodynotes" style={{ minHeight: 64 }} value={form.notes} onChange={set('notes')} />
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, textTransform: 'none', fontSize: 'var(--text-sm)' }}>
        <input
          type="checkbox"
          style={{ width: 20, height: 20, minHeight: 20 }}
          checked={form.is_baseline}
          onChange={(e) => setForm((f) => ({ ...f, is_baseline: e.target.checked }))}
        />
        Use as study baseline
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
          {busy ? 'Saving…' : 'Save measurement'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
