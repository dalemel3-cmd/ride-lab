import { useState } from 'react'
import { Download, LogOut, RefreshCw } from 'lucide-react'
import { supabase, clearSignedInBefore } from '../../supabaseClient.js'
import { downloadExport, syncQueue, queueLength } from '../../data/store.js'
import { predictedMaxHr } from '../../data/metrics.js'
import { NUMERIC_BOUNDS, SURFACES } from '../../settings.js'
import { ScienceNote } from '../../components/ui.jsx'

/**
 * Settings, plus the two operational escapes: force a sync, and export
 * everything. Both exist so the rider is never stuck waiting on the app to
 * decide something for them.
 */
export default function SettingsScreen({ settings, onUpdateSettings, showToast, setPending, refresh }) {
  const [syncing, setSyncing] = useState(false)

  const set = (key) => (event) => {
    const raw = event.target.value
    const value = key in NUMERIC_BOUNDS ? Number(raw) : raw
    onUpdateSettings({ ...settings, [key]: value })
  }

  const predicted = predictedMaxHr(settings.age)

  async function handleSync() {
    setSyncing(true)
    try {
      const result = await syncQueue()
      setPending(result.remaining)
      showToast(
        result.remaining > 0
          ? `${result.synced} synced, ${result.remaining} still waiting`
          : result.synced > 0
            ? `Synced ${result.synced}`
            : 'Everything is already synced',
      )
      refresh()
    } finally {
      setSyncing(false)
    }
  }

  async function handleSignOut() {
    if (!window.confirm('Sign out? Anything not yet synced stays on this device.')) return
    clearSignedInBefore()
    await supabase.auth.signOut()
    window.location.reload()
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Settings</h2>
      </div>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: 'var(--text-base)' }}>Rider</h3>
        <div className="field-grid">
          <div className="full">
            <label htmlFor="riderName">Name</label>
            <input id="riderName" value={settings.riderName} onChange={set('riderName')} />
          </div>
          <div className="full">
            <label htmlFor="bikeName">Bike</label>
            <input id="bikeName" value={settings.bikeName} onChange={set('bikeName')} />
          </div>
          <div className="full">
            <label htmlFor="homeBase">Home base</label>
            <input id="homeBase" value={settings.homeBase} onChange={set('homeBase')} />
          </div>
        </div>
      </section>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: 'var(--text-base)' }}>Physiology</h3>
        <div className="field-grid">
          <div>
            <label htmlFor="age">Age</label>
            <input
              id="age"
              type="number"
              inputMode="numeric"
              min={NUMERIC_BOUNDS.age.min}
              max={NUMERIC_BOUNDS.age.max}
              value={settings.age}
              onChange={set('age')}
            />
          </div>
          <div>
            <label htmlFor="maxHr">Max HR (bpm)</label>
            <input
              id="maxHr"
              type="number"
              inputMode="numeric"
              min={NUMERIC_BOUNDS.maxHr.min}
              max={NUMERIC_BOUNDS.maxHr.max}
              value={settings.maxHr}
              onChange={set('maxHr')}
            />
          </div>
          <div className="full">
            <label htmlFor="restingHrTarget">Resting HR goal (bpm)</label>
            <input
              id="restingHrTarget"
              type="number"
              inputMode="numeric"
              min={NUMERIC_BOUNDS.restingHrTarget.min}
              max={NUMERIC_BOUNDS.restingHrTarget.max}
              value={settings.restingHrTarget}
              onChange={set('restingHrTarget')}
            />
          </div>
        </div>

        {predicted && (
          <ScienceNote title="About max heart rate">
            Every zone in this app is a percentage of this number, so it is worth getting right. The
            age formula (Tanaka: 208 − 0.7 × age) predicts <strong>{predicted} bpm</strong> for you,
            but individual variation is roughly ±10–12 bpm, which is enough to shift a whole zone.
            If you have ever seen a higher number on a hard climb or a sprint finish, use that
            instead — an observed max always beats a predicted one.
            {predicted !== settings.maxHr && (
              <>
                {' '}
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: 10, minHeight: 36, padding: '6px 12px' }}
                  onClick={() => onUpdateSettings({ ...settings, maxHr: predicted })}
                >
                  Use {predicted}
                </button>
              </>
            )}
          </ScienceNote>
        )}
      </section>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: 'var(--text-base)' }}>Case study</h3>
        <div className="field-grid">
          <div>
            <label htmlFor="caseStudyStartDate">Start date</label>
            <input
              id="caseStudyStartDate"
              type="date"
              value={settings.caseStudyStartDate}
              onChange={set('caseStudyStartDate')}
            />
          </div>
          <div>
            <label htmlFor="caseStudyWeeks">Length (weeks)</label>
            <input
              id="caseStudyWeeks"
              type="number"
              inputMode="numeric"
              min={NUMERIC_BOUNDS.caseStudyWeeks.min}
              max={NUMERIC_BOUNDS.caseStudyWeeks.max}
              value={settings.caseStudyWeeks}
              onChange={set('caseStudyWeeks')}
            />
          </div>
          <div className="full">
            <label htmlFor="defaultSurface">Default surface</label>
            <select id="defaultSurface" value={settings.defaultSurface} onChange={set('defaultSurface')}>
              {SURFACES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ fontSize: 'var(--text-base)' }}>Data</h3>
        <p className="muted" style={{ margin: 0 }}>
          {queueLength() > 0
            ? `${queueLength()} ${queueLength() === 1 ? 'entry is' : 'entries are'} saved on this device and waiting to reach the server.`
            : 'Everything is synced.'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={16} aria-hidden="true" /> {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button className="btn" onClick={downloadExport}>
            <Download size={16} aria-hidden="true" /> Export JSON
          </button>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          The export contains every ride, measurement, and journal entry — the raw data behind every
          chart. Worth doing at the end of the study, and any time you want to hand someone the
          numbers.
        </p>
      </section>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ fontSize: 'var(--text-base)' }}>Account</h3>
        <button className="btn btn-danger" style={{ alignSelf: 'flex-start' }} onClick={handleSignOut}>
          <LogOut size={16} aria-hidden="true" /> Sign out
        </button>
      </section>
    </div>
  )
}
