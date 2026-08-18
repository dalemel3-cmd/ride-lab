import { useEffect, useState } from 'react'
import { supabase, hasSignedInBefore, markSignedInBefore, isSupabaseConfigured } from '../supabaseClient.js'
import LoginScreen from './LoginScreen.jsx'

/**
 * Decides whether to show the app or the login screen.
 *
 * The important case is the offline one: a rider who has signed in on this
 * device before must get into the app even when Supabase is unreachable, so
 * they can still log the ride they just finished. The queue in data/store.js
 * syncs it when signal comes back.
 */
export default function AuthGate({ children }) {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [offlineGrant, setOfflineGrant] = useState(false)

  useEffect(() => {
    let cancelled = false

    // If Supabase can't answer within a couple of seconds, don't hold a
    // previously-signed-in rider at a spinner — let them in and sync later.
    const offlineTimer = setTimeout(() => {
      if (cancelled) return
      if (hasSignedInBefore()) {
        setOfflineGrant(true)
        setChecking(false)
      }
    }, 2500)

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return
        if (data?.session) markSignedInBefore()
        setSession(data?.session ?? null)
        setChecking(false)
      })
      .catch(() => {
        if (cancelled) return
        setOfflineGrant(hasSignedInBefore())
        setChecking(false)
      })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession) markSignedInBefore()
      setSession(nextSession)
      setChecking(false)
    })

    return () => {
      cancelled = true
      clearTimeout(offlineTimer)
      listener?.subscription?.unsubscribe()
    }
  }, [])

  if (!isSupabaseConfigured) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
        <h2 style={{ color: 'var(--status-error)' }}>Missing configuration</h2>
        <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
          The app cannot reach the database because it was built without its Supabase settings.
        </p>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <strong style={{ fontSize: 'var(--text-sm)' }}>Running locally</strong>
          <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
            Create a file named exactly <code>.env</code> in the project folder — not{' '}
            <code>.env.txt</code>, which is what Notepad saves by default — containing:
          </p>
          <pre
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface-raised)',
              color: 'var(--color-text-muted)',
              fontSize: 12,
              overflowX: 'auto',
            }}
          >
            {'VITE_SUPABASE_URL=...\nVITE_SUPABASE_ANON_KEY=...'}
          </pre>
          <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
            Then stop the dev server and start it again — these are read once at startup.
          </p>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <strong style={{ fontSize: 'var(--text-sm)' }}>Deployed</strong>
          <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
            Add both variables in your host&rsquo;s environment settings and redeploy. They are
            baked in at build time, so adding them without rebuilding changes nothing.
          </p>
        </div>
      </div>
    )
  }

  if (checking) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--color-text-muted)',
        }}
      >
        Loading…
      </div>
    )
  }

  if (!session && !offlineGrant) return <LoginScreen />

  return children
}
