import { useState } from 'react'
import { Bike } from 'lucide-react'
import { supabase, markSignedInBefore } from '../supabaseClient.js'

/**
 * Email + password, sign in or sign up.
 *
 * One rider, one account — no roles, no approval flow. Sign-up is present only
 * so the first account can be created without a trip to the Supabase dashboard.
 */
export default function LoginScreen() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setMessage(null)

    try {
      const fn = mode === 'signin' ? 'signInWithPassword' : 'signUp'
      const { data, error } = await supabase.auth[fn]({ email, password })
      if (error) throw error

      if (mode === 'signup' && !data.session) {
        // Email confirmation is on for this project.
        setMessage({ tone: 'ok', text: 'Check your email to confirm, then sign in.' })
      } else {
        markSignedInBefore()
      }
    } catch (error) {
      setMessage({ tone: 'error', text: error?.message ?? 'Could not sign in.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="card"
        style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Bike size={32} color="var(--color-accent)" aria-hidden="true" />
          <div>
            <h1 style={{ fontSize: 'var(--text-2xl)' }}>Ride Lab</h1>
            <p className="muted" style={{ margin: 0 }}>
              Four months, measured.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {message && (
          <p
            className="muted"
            style={{
              margin: 0,
              color: message.tone === 'error' ? 'var(--status-error)' : 'var(--status-success)',
            }}
          >
            {message.text}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          className="btn"
          style={{ background: 'none', border: 'none', minHeight: 'auto' }}
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setMessage(null)
          }}
        >
          <span className="muted">
            {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
          </span>
        </button>
      </form>
    </div>
  )
}
