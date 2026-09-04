import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Activity, Bike, HeartPulse, NotebookPen, Repeat, TrendingUp, Settings as SettingsIcon, RotateCw } from 'lucide-react'
import { loadTable, syncQueue, queueLength, TABLES } from './data/store.js'
import { loadSettings, saveSettings } from './settings.js'

// Each screen is split out so the first paint on a phone only pays for the one
// being looked at — Progress in particular drags in all of Recharts.
const DashboardScreen = lazy(() => import('./features/dashboard/DashboardScreen.jsx'))
const RideLogScreen = lazy(() => import('./features/rides/RideLogScreen.jsx'))
const BodyCompScreen = lazy(() => import('./features/body/BodyCompScreen.jsx'))
const JournalScreen = lazy(() => import('./features/journal/JournalScreen.jsx'))
const RepeatsScreen = lazy(() => import('./features/routes/RepeatsScreen.jsx'))
const ProgressScreen = lazy(() => import('./features/progress/ProgressScreen.jsx'))
const SettingsScreen = lazy(() => import('./features/settings/SettingsScreen.jsx'))

const NAV = [
  { key: 'today', label: 'Today', Icon: Activity },
  { key: 'rides', label: 'Rides', Icon: Bike },
  { key: 'body', label: 'Body', Icon: HeartPulse },
  { key: 'journal', label: 'Journal', Icon: NotebookPen },
  { key: 'repeats', label: 'Repeats', Icon: Repeat },
  { key: 'progress', label: 'Progress', Icon: TrendingUp },
]

const VALID_SCREENS = new Set([...NAV.map((n) => n.key), 'settings'])

// The Repeats screen was called Routes while it was a trail library. A bookmark
// or home-screen shortcut pointing at #routes should still land somewhere real
// rather than silently falling through to Today.
const SCREEN_ALIASES = { routes: 'repeats' }

const resolveScreen = (hash) => {
  const key = SCREEN_ALIASES[hash] ?? hash
  return VALID_SCREENS.has(key) ? key : null
}

export default function App() {
  const [screen, setScreenState] = useState(() => {
    return resolveScreen(window.location.hash.replace('#', '')) ?? 'today'
  })

  const [settings, setSettings] = useState(loadSettings)
  const [rides, setRides] = useState([])
  const [bodyComp, setBodyComp] = useState([])
  const [journal, setJournal] = useState([])
  const [pending, setPending] = useState(queueLength)
  const [toast, setToast] = useState(null)

  // The scrolling element is <main>, not the window, so moving between screens
  // has to reset it explicitly. Without this, opening Rides from the bottom of
  // a long Progress page lands you halfway down the ride list with no idea the
  // screen changed.
  const mainRef = useRef(null)

  // Hash routing: the back button works and a screen can be linked to, without
  // pulling in a router for six screens.
  const setScreen = useCallback((next) => {
    window.location.hash = next
    setScreenState(next)
  }, [])

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [screen])

  useEffect(() => {
    const onHashChange = () => {
      const next = resolveScreen(window.location.hash.replace('#', ''))
      if (next) setScreenState(next)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const [refreshing, setRefreshing] = useState(false)

  // One timer, replaced rather than stacked. Each call used to start its own
  // and none was ever cleared, so two toasts in quick succession — "Ride saved"
  // then "Synced 1 pending entry" — left the first one's timer running, and it
  // dismissed the second message early. It also fired after unmount.
  const toastTimer = useRef(null)
  const showToast = useCallback((text, tone = 'ok') => {
    setToast({ text, tone })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }, [])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const [rd, bc, jn] = await Promise.all([
        loadTable(TABLES.rides),
        loadTable(TABLES.bodyComp),
        loadTable(TABLES.journal),
      ])

      setRides(rd.rows)
      setBodyComp(bc.rows)
      setJournal(jn.rows)
      setPending(queueLength())
    } finally {
      setRefreshing(false)
    }
  }, [])

  // Full bidirectional sync: triggers Service Worker update check, drains offline
  // writes to Supabase, and re-reads all tables so data stays consistent across
  // phone, web, and background integrations.
  const handleFullSync = useCallback(async (manual = false) => {
    setRefreshing(true)
    try {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then((reg) => reg?.update())
      }

      const result = await syncQueue()
      setPending(result.remaining)

      await refresh()

      if (result.synced > 0) {
        showToast(`Synced ${result.synced} pending ${result.synced === 1 ? 'entry' : 'entries'}`)
      } else if (manual) {
        showToast('Updated from cloud')
      }
    } finally {
      setRefreshing(false)
    }
  }, [refresh, showToast])

  // Drain the offline queue and reconcile with the cloud whenever there's a plausible
  // reason data might have changed: app start, regained connectivity, window focus,
  // or coming back to the foreground from a backgrounded mobile PWA state.
  useEffect(() => {
    let cancelled = false

    const triggerSync = async () => {
      if (cancelled) return
      await handleFullSync(false)
    }

    triggerSync()

    const onVisible = () => {
      if (document.visibilityState === 'visible') triggerSync()
    }

    window.addEventListener('online', triggerSync)
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.removeEventListener('online', triggerSync)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [handleFullSync])

  // Reconcile in the background when navigating between screens (throttled to 15s)
  const lastNavRefreshRef = useRef(0)
  useEffect(() => {
    const now = Date.now()
    if (now - lastNavRefreshRef.current > 15000) {
      lastNavRefreshRef.current = now
      refresh()
    }
  }, [screen, refresh])

  const handleUpdateSettings = useCallback((next) => {
    setSettings(saveSettings(next))
  }, [])

  const shared = {
    settings,
    rides,
    bodyComp,
    journal,
    refresh,
    refreshing,
    handleFullSync,
    showToast,
    setPending,
  }

  return (
    <div className="app-layout">
      {/* Two navigations exist because one is the phone layout and the other
          the desktop one, and only ever one is visible. They were both labelled
          "Main", which a screen reader reads out as two identical landmarks —
          so they are named for what they are instead. */}
      <nav className="sidebar" aria-label="Sidebar">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px 16px' }}>
          <h1
            style={{
              color: 'var(--color-accent)',
              fontSize: 'var(--text-xl)',
            }}
          >
            Ride Lab
          </h1>
          <button
            type="button"
            className="btn-icon"
            style={{
              minWidth: 44,
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              color: refreshing ? 'var(--color-accent)' : 'var(--color-text-muted)',
              cursor: 'pointer',
              padding: 0,
            }}
            onClick={() => handleFullSync(true)}
            aria-label="Refresh data"
            title="Refresh data"
          >
            <RotateCw size={16} className={refreshing ? 'spin' : ''} aria-hidden="true" />
          </button>
        </div>
        {NAV.map(({ key, label, Icon }) => (
          <button
            key={key}
            className="sidebar-item"
            data-active={screen === key}
            aria-current={screen === key ? 'page' : undefined}
            onClick={() => setScreen(key)}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </button>
        ))}
        <button
          className="sidebar-item"
          data-active={screen === 'settings'}
          aria-current={screen === 'settings' ? 'page' : undefined}
          onClick={() => setScreen('settings')}
        >
          <SettingsIcon size={18} aria-hidden="true" />
          Settings
        </button>
      </nav>

      {/* Mobile Top App Bar with Quick Sync / Refresh */}
      <header className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-lg)',
              color: 'var(--color-accent)',
              letterSpacing: '0.04em',
            }}
          >
            Ride Lab
          </span>
          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            · {[...NAV, { key: 'settings', label: 'Settings' }].find((n) => n.key === screen)?.label ?? 'Today'}
          </span>
        </div>
        <button
          type="button"
          aria-label="Refresh data"
          title="Refresh data"
          style={{
            minWidth: 44,
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            color: refreshing ? 'var(--color-accent)' : 'var(--color-text-muted)',
            cursor: 'pointer',
            padding: 0,
          }}
          onClick={() => handleFullSync(true)}
        >
          <RotateCw size={18} className={refreshing ? 'spin' : ''} aria-hidden="true" />
        </button>
      </header>

      <main className="app-main" ref={mainRef}>
        <div className="content-width">
          {pending > 0 && (
            <p
              className="muted"
              style={{
                marginTop: 0,
                marginBottom: 16,
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-surface)',
                border: '1px solid var(--status-warn)',
                color: 'var(--status-warn)',
              }}
            >
              {pending} {pending === 1 ? 'entry is' : 'entries are'} saved on this device and
              waiting to sync.
            </p>
          )}

          <Suspense fallback={<p className="muted">Loading…</p>}>
            {screen === 'today' && <DashboardScreen {...shared} onNavigate={setScreen} />}
            {screen === 'rides' && <RideLogScreen {...shared} />}
            {screen === 'body' && <BodyCompScreen {...shared} />}
            {screen === 'journal' && <JournalScreen {...shared} />}
            {screen === 'repeats' && <RepeatsScreen {...shared} />}
            {screen === 'progress' && <ProgressScreen {...shared} />}
            {screen === 'settings' && (
              <SettingsScreen {...shared} onUpdateSettings={handleUpdateSettings} />
            )}
          </Suspense>
        </div>
      </main>

      {/* Settings is appended here rather than living in NAV, because the
          sidebar renders it as a separate item below the main group. Leaving it
          out of this list made Settings unreachable on a phone: the sidebar is
          display:none below 768px, so the only way in was typing the #settings
          hash by hand — on the device this app is actually used on. */}
      <nav className="bottom-nav" aria-label="Main">
        {[...NAV, { key: 'settings', label: 'Settings', Icon: SettingsIcon }].map(({ key, label, Icon }) => (
          <button
            key={key}
            className="nav-item"
            data-active={screen === key}
            aria-current={screen === key ? 'page' : undefined}
            onClick={() => setScreen(key)}
          >
            <Icon size={20} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {toast && (
        <div className="toast" data-tone={toast.tone} role="status">
          {toast.text}
        </div>
      )}
    </div>
  )
}
