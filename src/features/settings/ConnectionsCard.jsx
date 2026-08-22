import { useCallback, useEffect, useState } from 'react'
import { Link2, RefreshCw, Unlink, Stethoscope } from 'lucide-react'
import {
  getIntegrationStatus,
  getIntegrationConfig,
  connectProvider,
  disconnectProvider,
  syncIntegrations,
  readConnectResult,
  discoverProviderTypes,
  PROVIDER_LABELS,
  PROVIDER_BLURBS,
} from '../../data/integrations.js'
import { formatShortDate, recordDate } from '../../data/dates.js'

/**
 * Connect, sync, and disconnect Strava and Fitbit.
 *
 * Status is fetched from the server rather than cached locally, because a
 * connection can be revoked from the provider's own settings page and a stale
 * "connected" badge would be a lie.
 */

// Fitbit is intentionally absent: its API is switched off at the end of
// September 2026, so offering it would invite someone to set up an integration
// with weeks to live. Rows already connected still appear, via `status`.
const PROVIDERS = ['google_health', 'strava']

/** A copyable value for pasting into a provider's developer console. */
function Field({ label, value }) {
  return (
    <div>
      <div className="muted">{label}</div>
      <code
        style={{
          display: 'block',
          padding: '6px 8px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-surface-raised)',
          color: 'var(--color-text)',
          wordBreak: 'break-all',
          userSelect: 'all',
        }}
      >
        {value}
      </code>
    </div>
  )
}

export default function ConnectionsCard({ showToast, refresh }) {
  const [status, setStatus] = useState([])
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  // Raw provider capability report, shown verbatim when asked for.
  const [discovery, setDiscovery] = useState(null)

  const loadStatus = useCallback(async () => {
    try {
      // Both together: which providers are set up server-side, and which are
      // actually connected. Connected-but-unconfigured is impossible, but
      // configured-but-unconnected is the normal starting state.
      const [connections, cfg] = await Promise.all([
        getIntegrationStatus(),
        getIntegrationConfig().catch(() => null),
      ])
      setStatus(connections)
      setConfig(cfg)
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

  /**
   * Ask the provider what it will actually give this account.
   *
   * The answer is kept verbatim rather than summarised. When a field syncs as
   * empty the useful information is usually the exact identifier the provider
   * uses, or the exact error it returns — both of which a friendly summary
   * would throw away.
   */
  async function handleDiscover(provider) {
    setBusy(`${provider}:discover`)
    setDiscovery(null)
    try {
      const result = await discoverProviderTypes(provider)
      setDiscovery({ provider, result })
    } catch (err) {
      setDiscovery({ provider, error: String(err.message ?? err) })
    } finally {
      setBusy(null)
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
        // Anything already connected but no longer offered (Fitbit) still needs
        // somewhere to be disconnected from.
        [...new Set([...PROVIDERS, ...status.map((s) => s.provider)])].map((provider) => {
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
                {connection ? (
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
                ) : (
                  config &&
                  !config[provider] && (
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        border: '1px solid var(--color-text-muted)',
                        color: 'var(--color-text-muted)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 700,
                      }}
                    >
                      NEEDS SETUP
                    </span>
                  )
                )}
              </div>

              <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
                {PROVIDER_BLURBS[provider]}
              </p>

              {config && !config[provider] && !connection && (
                // Say what is missing before the button is pressed. Sending
                // someone to a provider's consent screen only to fail on the
                // way back is the worst possible place to discover this.
                <p
                  className="muted"
                  style={{
                    margin: 0,
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface-raised)',
                    lineHeight: 1.5,
                  }}
                >
                  API keys for {PROVIDER_LABELS[provider]} are not set yet. Register a developer
                  app, then add its ID and secret in Supabase under Edge Functions → Secrets. Full
                  steps are in <code>docs/INTEGRATIONS.md</code>.
                </p>
              )}

              {connection?.last_synced_at && (
                <span className="muted">
                  Last synced {formatShortDate(recordDate(connection, 'last_synced_at'))}
                </span>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {connection ? (
                  <>
                    <button className="btn" onClick={() => handleSync(provider)} disabled={busy !== null}>
                      <RefreshCw size={16} aria-hidden="true" />
                      {busy === provider ? 'Syncing…' : 'Sync now'}
                    </button>
                    <button className="btn" onClick={() => handleDiscover(provider)} disabled={busy !== null}>
                      <Stethoscope size={16} aria-hidden="true" />
                      {busy === `${provider}:discover` ? 'Checking…' : 'What syncs?'}
                    </button>
                    <button className="btn" onClick={() => handleDisconnect(provider)} disabled={busy !== null}>
                      <Unlink size={16} aria-hidden="true" /> Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={() => handleConnect(provider)}
                    // Disabled rather than hidden when unconfigured: the button
                    // should still show what is on offer, just not pretend it
                    // can work yet.
                    disabled={busy !== null || (config ? !config[provider] : false)}
                  >
                    <Link2 size={16} aria-hidden="true" />
                    {busy === provider ? 'Opening…' : `Connect ${PROVIDER_LABELS[provider]}`}
                  </button>
                )}
              </div>

              {discovery?.provider === provider && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: 10,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface-raised)',
                  }}
                >
                  <strong style={{ fontSize: 'var(--text-xs)' }}>
                    {discovery.error ? 'Could not ask the provider' : 'What this account exposes'}
                  </strong>
                  <pre
                    style={{
                      margin: 0,
                      fontSize: 11,
                      lineHeight: 1.45,
                      maxHeight: 260,
                      // Long identifiers must not stretch the page sideways;
                      // the phone layout has no horizontal scroll anywhere else.
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {discovery.error ?? JSON.stringify(discovery.result, null, 2)}
                  </pre>
                  <button
                    className="btn"
                    style={{ alignSelf: 'flex-start', padding: '6px 10px', minHeight: 'var(--tap-target)' }}
                    onClick={() => setDiscovery(null)}
                  >
                    Hide
                  </button>
                </div>
              )}
            </div>
          )
        })}

      {config?.callback_url && (
        // Both providers ask for this when registering the developer app, and
        // typing it from memory is how the redirect_uri mismatch happens. Shown
        // so it can be copied exactly.
        <details style={{ fontSize: 'var(--text-xs)' }}>
          <summary style={{ color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            Values needed when registering a developer app
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <Field label="Redirect / callback URL" value={config.callback_url} />
            <Field
              label="Strava — Authorization Callback Domain (domain only)"
              value={new URL(config.callback_url).host}
            />
            <Field label="App URL currently configured" value={config.app_url ?? 'not set'} />
          </div>
        </details>
      )}

      <p className="muted" style={{ margin: 0, lineHeight: 1.5, fontSize: 'var(--text-xs)' }}>
        Imported rides never overwrite anything you typed — an RPE you entered by hand survives
        every future sync. Apple Health is not offered because it has no web API at all; reading it
        requires a native iOS app.
      </p>
    </section>
  )
}
