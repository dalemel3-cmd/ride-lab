/**
 * Client side of the Strava and Fitbit integrations.
 *
 * Every call goes to an Edge Function with the user's JWT. Tokens are never
 * sent to or stored in the browser — the integrations table has RLS on with no
 * policies, so only the service-role key inside those functions can read it.
 * The most this module ever learns is *that* a provider is connected.
 */

import { supabase } from '../supabaseClient.js'

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Sign in first.')
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  }
}

async function callFunction(name, body) {
  const response = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body ?? {}),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || `${name} failed (${response.status})`)
  }
  return payload
}

/** Which providers are connected, and when they last synced. */
export async function getIntegrationStatus() {
  const { integrations } = await callFunction('integrations', { action: 'status' })
  return integrations ?? []
}

/**
 * Start a connect flow.
 *
 * Navigates the whole tab rather than opening a popup: popups are blocked or
 * awkward on mobile, and the provider redirects back to the app anyway.
 */
export async function connectProvider(provider) {
  const { url } = await callFunction('oauth-start', {
    provider,
    redirect_to: window.location.origin,
  })
  window.location.href = url
}

export async function disconnectProvider(provider) {
  return callFunction('integrations', { action: 'disconnect', provider })
}

/**
 * Pull new data from connected providers.
 *
 * `sinceDays` is a window, not a cursor — re-importing is safe because rides
 * are keyed on (source, external_id) and body/journal rows on (date, source).
 */
export async function syncIntegrations({ provider, sinceDays = 30 } = {}) {
  return callFunction('integrations', {
    action: 'sync',
    provider,
    since_days: sinceDays,
  })
}

/**
 * Read the ?connect=… status the OAuth callback redirects back with, and strip
 * it from the URL so a refresh doesn't replay the message.
 */
export function readConnectResult() {
  const params = new URLSearchParams(window.location.search)
  const status = params.get('connect')
  if (!status) return null

  const provider = params.get('provider') ?? ''
  params.delete('connect')
  params.delete('provider')
  const query = params.toString()
  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
  )

  return { status, provider }
}

export const PROVIDER_LABELS = {
  strava: 'Strava',
  fitbit: 'Fitbit',
}

export const PROVIDER_BLURBS = {
  strava:
    'Imports rides automatically: distance, moving time, elevation, heart rate, and the GPS route. RPE stays yours to fill in — no app can infer how hard something felt.',
  fitbit:
    'Imports resting heart rate, weight, body fat, and sleep. Resting HR is the number that moves first when aerobic fitness improves.',
}
