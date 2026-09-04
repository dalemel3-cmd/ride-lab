import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import AuthGate from './auth/AuthGate.jsx'
import './styles.css'
import { registerSW } from 'virtual:pwa-register'

let refreshing = false
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true)
  },
  onRegisteredSW(swUrl, registration) {
    if (registration) {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update()
        }
      })
    }
  },
})

/**
 * Catches render errors so a bad chart can't leave the rider staring at a blank
 * screen with a ride still unlogged. Offers a reload, and reassures them the
 * local data is intact — because it is.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Ride Lab crashed:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ color: 'var(--status-error)' }}>Something broke</h2>
        <p className="muted">
          Your saved rides are safe on this device. Reloading usually clears it.
        </p>
        <pre
          style={{
            padding: 12,
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-surface)',
            color: 'var(--color-text-muted)',
            fontSize: 12,
            overflowX: 'auto',
          }}
        >
          {String(this.state.error?.message ?? this.state.error)}
        </pre>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthGate>
        <App />
      </AuthGate>
    </ErrorBoundary>
  </StrictMode>,
)
