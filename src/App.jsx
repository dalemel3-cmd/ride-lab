import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Activity, Bike, HeartPulse, NotebookPen, Map, TrendingUp, Settings as SettingsIcon } from 'lucide-react'
import { loadTable, syncQueue, saveRow, queueLength, TABLES } from './data/store.js'
import { loadSettings, saveSettings, SEED_ROUTES } from './settings.js'

// Each screen is split out so the first paint on a phone only pays for the one
// being looked at — Progress in particular drags in all of Recharts.
const DashboardScreen = lazy(() => import('./features/dashboard/DashboardScreen.jsx'))
const RideLogScreen = lazy(() => import('./features/rides/RideLogScreen.jsx'))
const BodyCompScreen = lazy(() => import('./features/body/BodyCompScreen.jsx'))
const JournalScreen = lazy(() => import('./features/journal/JournalScreen.jsx'))
const RoutesScreen = lazy(() => import('./features/routes/RoutesScreen.jsx'))
const ProgressScreen = lazy(() => import('./features/progress/ProgressScreen.jsx'))
const SettingsScreen = lazy(() => import('./features/settings/SettingsScreen.jsx'))

const NAV = [
  { key: 'today', label: 'Today', Icon: Activity },
  { key: 'rides', label: 'Rides', Icon: Bike },
  { key: 'body', label: 'Body', Icon: HeartPulse },
  { key: 'journal', label: 'Journal', Icon: NotebookPen },
  { key: 'routes', label: 'Routes', Icon: Map },
  { key: 'progress', label: 'Progress', Icon: TrendingUp },
]

const VALID_SCREENS = new Set([...NAV.map((n) => n.key), 'settings'])

// Marks that the starter route library has been planted once on this device.
const ROUTES_SEEDED_KEY = 'ridelab_routes_seeded'

export default function App() {
  const [screen, setScreenState] = useState(() => {
    const fromHash = window.location.hash.replace('#', '')
    return VALID_SCREENS.has(fromHash) ? fromHash : 'today'
  })

  const [settings, setSettings] = useState(loadSettings)
  const [rides, setRides] = useState([])
  const [bodyComp, setBodyComp] = useState([])
  const [journal, setJournal] = useState([])
  const [routes, setRoutes] = useState([])
  const [pending, setPending] = useState(queueLength)
  const [toast, setToast] = useState(null)

  // Hash routing: the back button works and a screen can be linked to, without
  // pulling in a router for six screens.
  const setScreen = useCallback((next) => {
    window.location.hash = next
    setScreenState(next)
  }, [])

  useEffect(() => {
    const onHashChange = () => {
      const next = window.location.hash.replace('#', '')
      if (VALID_SCREENS.has(next)) setScreenState(next)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const showToast = useCallback((text, tone = 'ok') => {
    setToast({ text, tone })
    setTimeout(() => setToast(null), 2800)
  }, [])

  const refresh = useCallback(async () => {
    const [r, b, j, rt] = await Promise.all([
      loadTable(TABLES.rides),
      loadTable(TABLES.bodyComp),
      loadTable(TABLES.journal),
      loadTable(TABLES.routes),
    ])
    setRides(r.rows)
    setBodyComp(b.rows)
    setJournal(j.rows)

    // First run on a new account: seed the Bentonville route library so the
    // ride form has something to pick from immediately.
    //
    // The localStorage marker is what makes this once-only. Keyed on "an empty
    // table" alone, deleting every route — a perfectly reasonable thing to do
    // if you ride somewhere else — would silently resurrect all six on the next
    // load, with no way to be rid of them.
    const alreadySeeded = (() => {
      try {
        return localStorage.getItem(ROUTES_SEEDED_KEY) === '1'
      } catch {
        return false
      }
    })()

    if (rt.rows.length === 0 && !rt.fromCache && !alreadySeeded) {
      const seeded = []
      for (const route of SEED_ROUTES) {
        const { row } = await saveRow(TABLES.routes, route)
        seeded.push(row)
      }
      try {
        localStorage.setItem(ROUTES_SEEDED_KEY, '1')
      } catch {
        /* private mode — worst case the library seeds again next launch */
      }
      setRoutes(seeded)
    } else {
      setRoutes(rt.rows)
    }

    setPending(queueLength())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Drain the offline queue whenever there's a plausible reason it might now
  // succeed: app start, regained connectivity, or the app coming back to the
  // foreground after being backgrounded mid-ride.
  useEffect(() => {
    let cancelled = false

    const attemptSync = async () => {
      const result = await syncQueue()
      if (cancelled) return
      setPending(result.remaining)
      if (result.synced > 0) {
        showToast(`Synced ${result.synced} pending ${result.synced === 1 ? 'entry' : 'entries'}`)
        refresh()
      }
    }

    attemptSync()

    const onVisible = () => {
      if (document.visibilityState === 'visible') attemptSync()
    }

    window.addEventListener('online', attemptSync)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.removeEventListener('online', attemptSync)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh, showToast])

  const handleUpdateSettings = useCallback((next) => {
    setSettings(saveSettings(next))
  }, [])

  const shared = {
    settings,
    rides,
    bodyComp,
    journal,
    routes,
    refresh,
    showToast,
    setPending,
  }

  return (
    <div className="app-layout">
      <nav className="sidebar" aria-label="Main">
        <h1
          style={{
            padding: '0 14px 16px',
            color: 'var(--color-accent)',
            fontSize: 'var(--text-xl)',
          }}
        >
          Ride Lab
        </h1>
        {NAV.map(({ key, label, Icon }) => (
          <button
            key={key}
            className="sidebar-item"
            data-active={screen === key}
            onClick={() => setScreen(key)}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </button>
        ))}
        <button
          className="sidebar-item"
          data-active={screen === 'settings'}
          onClick={() => setScreen('settings')}
        >
          <SettingsIcon size={18} aria-hidden="true" />
          Settings
        </button>
      </nav>

      <main className="app-main">
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
            {screen === 'routes' && <RoutesScreen {...shared} onNavigate={setScreen} />}
            {screen === 'progress' && <ProgressScreen {...shared} />}
            {screen === 'settings' && (
              <SettingsScreen {...shared} onUpdateSettings={handleUpdateSettings} />
            )}
          </Suspense>
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Main">
        {NAV.map(({ key, label, Icon }) => (
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
