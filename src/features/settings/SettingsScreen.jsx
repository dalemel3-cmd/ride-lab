import { useEffect, useState } from 'react'
import { AlertTriangle, Download, LogOut, RefreshCw } from 'lucide-react'
import { supabase, clearSignedInBefore } from '../../supabaseClient.js'
import {
  downloadExport,
  syncQueue,
  queueLength,
  stuckEntries,
  discardQueuedEntry,
  STUCK_AFTER_ATTEMPTS,
} from '../../data/store.js'
import { predictedMaxHr } from '../../data/metrics.js'
import { NUMERIC_BOUNDS, SURFACES } from '../../settings.js'
import { ScienceNote } from '../../components/ui.jsx'
import ConnectionsCard from './ConnectionsCard.jsx'
import MetricGuide from '../../components/MetricGuide.jsx'
import { APP_VERSION } from '../../version.js'

/**
 * Settings, plus the two operational escapes: force a sync, and export
 * everything. Both exist so the rider is never stuck waiting on the app to
 * decide something for them.
 */
export default function SettingsScreen({ settings, onUpdateSettings, showToast, setPending, refresh }) {
  const [syncing, setSyncing] = useState(false)
  // queueLength() and stuckEntries() read localStorage, so they have to be held
  // in state and refreshed after a sync — reading them during render would show
  // a figure that never updates.
  const [pendingCount, setPendingCount] = useState(0)
  const [stuck, setStuck] = useState([])

  const refreshQueueView = () => {
    setPendingCount(queueLength())
    setStuck(stuckEntries())
  }

  useEffect(refreshQueueView, [])

  const [localSettings, setLocalSettings] = useState(settings)

  useEffect(() => {
    setLocalSettings(settings)
  }, [settings])

  const set = (key) => (event) => {
    setLocalSettings((prev) => ({ ...prev, [key]: event.target.value }))
  }

  const commit = (key) => () => {
    const raw = localSettings[key]
    const value = key in NUMERIC_BOUNDS ? Number(raw) : raw
    onUpdateSettings({ ...settings, [key]: value })
  }

  const predicted = predictedMaxHr(settings.age)

  async function handleSync() {
    setSyncing(true)
    try {
      const result = await syncQueue()
      setPending(result.remaining)
      refreshQueueView()
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
            <input id="riderName" value={localSettings.riderName} onChange={set('riderName')} onBlur={commit('riderName')} />
          </div>
          <div className="full">
            <label htmlFor="bikeName">Bike</label>
            <input id="bikeName" value={localSettings.bikeName} onChange={set('bikeName')} onBlur={commit('bikeName')} />
          </div>
          <div className="full">
            <label htmlFor="homeBase">Home base</label>
            <input id="homeBase" value={localSettings.homeBase} onChange={set('homeBase')} onBlur={commit('homeBase')} />
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
              value={localSettings.age}
              onChange={set('age')}
              onBlur={commit('age')}
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
              value={localSettings.maxHr}
              onChange={set('maxHr')}
              onBlur={commit('maxHr')}
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
              value={localSettings.restingHrTarget}
              onChange={set('restingHrTarget')}
              onBlur={commit('restingHrTarget')}
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
              value={localSettings.caseStudyStartDate}
              onChange={set('caseStudyStartDate')}
              onBlur={commit('caseStudyStartDate')}
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
              value={localSettings.caseStudyWeeks}
              onChange={set('caseStudyWeeks')}
              onBlur={commit('caseStudyWeeks')}
            />
          </div>
          <div className="full">
            <label htmlFor="defaultSurface">Default surface</label>
            <select id="defaultSurface" value={localSettings.defaultSurface} onChange={set('defaultSurface')} onBlur={commit('defaultSurface')}>
              {SURFACES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <ConnectionsCard showToast={showToast} refresh={refresh} />

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ fontSize: 'var(--text-base)' }}>Data</h3>
        <p className="muted" style={{ margin: 0 }}>
          {pendingCount > 0
            ? `${pendingCount} ${pendingCount === 1 ? 'entry is' : 'entries are'} saved on this device and waiting to reach the server.`
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

        {stuck.length > 0 && (
          // Without this, an entry that can never sync is indistinguishable
          // from one merely waiting for signal: the banner stays up forever
          // with no reason given and nothing the rider can do.
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: 12,
              border: '1px solid var(--status-warn)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--status-warn)' }}>
              <AlertTriangle size={16} aria-hidden="true" />
              <strong style={{ fontSize: 'var(--text-sm)' }}>
                {stuck.length} {stuck.length === 1 ? 'entry keeps' : 'entries keep'} failing
              </strong>
            </div>

            <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
              These have been retried {STUCK_AFTER_ATTEMPTS}+ times and are unlikely to succeed on
              their own. Export first if you want a copy — discarding cannot be undone.
            </p>

            {stuck.map((entry) => (
              <div
                key={entry.id}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--text-sm)' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>
                    {entry.action} · {entry.table}
                  </div>
                  <div className="muted" style={{ wordBreak: 'break-word' }}>
                    {entry.error}
                  </div>
                </div>
                <button
                  className="btn"
                  style={{ padding: '6px 10px', minHeight: 36 }}
                  onClick={() => {
                    if (!window.confirm('Discard this entry permanently? It cannot be recovered.')) return
                    discardQueuedEntry(entry.id, entry.table)
                    refreshQueueView()
                    setPending(queueLength())
                    showToast('Entry discarded')
                  }}
                >
                  Discard
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="muted" style={{ margin: 0 }}>
          The export contains every ride, measurement, and journal entry — the raw data behind every
          chart. Worth doing at the end of the study, and any time you want to hand someone the
          numbers.
        </p>
      </section>

      {/* Above Account, so the reference material is reachable without
          scrolling past a sign-out button. */}
      <MetricGuide />

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 'var(--text-base)' }}>App Updates & Offline Cache</h3>
          <span className="version-pill">{APP_VERSION}</span>
        </div>
        <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
          Running <strong>{APP_VERSION}</strong>. Pull down from the top on any screen to refresh, or use the controls below to check for service worker updates and reconcile cloud data.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button
            className="btn"
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 8 }}
            onClick={async () => {
              showToast('Checking for app updates...')
              if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.getRegistration()
                if (reg) await reg.update()
              }
              await refresh()
              showToast('Data and cache updated')
            }}
          >
            <RefreshCw size={16} aria-hidden="true" /> Check for updates
          </button>
          <button
            className="btn"
            style={{ minHeight: 44, color: 'var(--status-warn)' }}
            onClick={async () => {
              if (!window.confirm('Force clear app cache and reload? Your cloud data is safe.')) return
              if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations()
                for (const r of registrations) await r.unregister()
              }
              if (typeof window !== 'undefined' && 'caches' in window) {
                const keys = await caches.keys()
                for (const k of keys) await caches.delete(k)
              }
              window.location.reload()
            }}
          >
            Clear cache & reload
          </button>
        </div>
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
