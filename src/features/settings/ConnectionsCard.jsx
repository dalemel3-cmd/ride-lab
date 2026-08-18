import { useCallback, useEffect, useState } from 'react'
import { Link2, RefreshCw, Unlink } from 'lucide-react'
import {
  getIntegrationStatus,
  connectProvider,
  disconnectProvider,
  syncIntegrations,
  readConnectResult,
  PROVIDER_LABELS,
  PROVIDER_BLURBS,
} from '../../data/integrations.js'
import { formatShortDate } from '../../data/dates.js'

/**
 * Connect, sync, and disconnect Strava and Fitbit.
 *
 * Status is fetched from the server rather than cached locally, because a
 * connection can be revoked from the provider's own settings page and a stale
 * "connected" badge would be a lie.
 */

const PROVIDERS = ['strava', 'fitbit']

export default function ConnectionsCard({ showToast, refresh }) {
  const [status, setStatus] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await getIntegrationStatus())
      setError(null)
    } catch (err) {
      setError(String(err.message ?? err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Surface the outcome of a connect flow we were redirected back from.
    const result = readConnectResult()
    if (result) {
      const label = PROVIDER_LABELS[result.provider] ?? 'Provider'
      if (result.status === 'success') showToast(`${label} connected`)
      else if (result.status === 'denied') showToast('Connection cancelled', 'error')
      else if (result.status === 'expired') showToast('That took too long — try again', 'error')
      else showToast(`Could not connect ${label}`, 'error')
    }
    loadStatus()
  }, [loadStatus, showToast])

  const connectedFor = (provider) => status.find((s) => s.provider === provider)

  async function handleConnect(provider) {
    setBusy(provider)
    try {
      await connectProvider(provider)
    } catch (err) {
      setBusy(null)
      showToast(String(err.message ?? err), 'error')
    }
  }

  async function handleDisconnect(provider) {
    const label = PROVIDER_LABELS[provider]
    if (!window.confirm(`Disconnect ${label}? Rides already imported are kept.`)) return
    setBusy(provider)
    try {
      await disconnectProvider(provider)
      showToast(`${label} disconnected`)
      await loadStatus()
    } catch (err) {
      showToast(String(err.message ?? err), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleSync(provider) {
    setBusy(provider ?? 'all')
    try {
      const { results, errors } = await syncIntegrations({ provider, sinceDays: 60 })
      const imported = Object.values(results ?? {}).reduce(
        (sum, r) => sum + (r?.imported ?? 0),
        0,
      )

      if (errors) {
        // Report the provider that failed rather than a generic message — the
        // usual cause is a revoked authorisation, which needs reconnecting.
        const first = Object.entries(errors)[0]
        showToast(`${PROVIDER_LABELS[first[0]] ?? first[0]}: ${first[1]}`, 'error')
      } else {
        showToast(imported > 0 ? `Imported ${imported} records` : 'Already up to date')
      }

      await loadStatus()
      refresh()
    } catch (err) {
      showToast(String(err.message ?? err), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ fontSize: 'var(--text-base)' }}>Connections</h3>
        {status.length > 0 && (
          <button className="btn" style={{ minHeight: 36, padding: '6px 12px' }} onClick={() => handleSync()} disabled={busy !== null}>
            <RefreshCw size={14} aria-hidden="true" /> {busy === 'all' ? 'Syncing…' : 'Sync all'}
          </button>
        )}
      </div>

      {loading && <p className="muted" style={{ margin: 0 }}>Checking…</p>}

      {error && (
        <p className="muted" style={{ margin: 0, color: 'var(--status-error)' }}>
          {error}
        </p>
      )}

      {!loading &&
        PROVIDERS.map((provider) => {
          const connection = connectedFor(provider)
          return (
            <div
              key={provider}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                paddingTop: 12,
                borderTop: '1px solid var(--color-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 'var(--text-sm)' }}>{PROVIDER_LABELS[provider]}</strong>
                {connection && (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'var(--status-success)',
                      color: 'var(--navy-950)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 700,
                    }}
                  >
                    CONNECTED
                  </span>
                )}
              </div>

              <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
                {PROVIDER_BLURBS[provider]}
              </p>

              {connection?.last_synced_at && (
                <span className="muted">
                  Last synced {formatShortDate(connection.last_synced_at.slice(0, 10))}
                </span>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {connection ? (
                  <>
                    <button className="btn" onClick={() => handleSync(provider)} disabled={busy !== null}>
                      <RefreshCw size={16} aria-hidden="true" />
                      {busy === provider ? 'Syncing…' : 'Sync now'}
                    </button>
                    <button className="btn" onClick={() => handleDisconnect(provider)} disabled={busy !== null}>
                      <Unlink size={16} aria-hidden="true" /> Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={() => handleConnect(provider)}
                    disabled={busy !== null}
                  >
                    <Link2 size={16} aria-hidden="true" />
                    {busy === provider ? 'Opening…' : `Connect ${PROVIDER_LABELS[provider]}`}
                  </button>
                )}
              </div>
            </div>
          )
        })}

      <p className="muted" style={{ margin: 0, lineHeight: 1.5, fontSize: 'var(--text-xs)' }}>
        Imported rides never overwrite anything you typed — an RPE you entered by hand survives
        every future sync. Apple Health is not offered because it has no web API at all; reading it
        requires a native iOS app.
      </p>
    </section>
  )
}
