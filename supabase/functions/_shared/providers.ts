/**
 * Shared OAuth + provider logic for Strava, Fitbit, and Google Health.
 *
 * Everything that touches a client secret or a stored token lives here, and
 * here only runs server-side. The browser never sees a token: the integrations
 * table has RLS on with no policies, so only the service-role key used by these
 * functions can read it.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export type Provider = 'strava' | 'fitbit' | 'google_health'

export interface TokenSet {
  access_token: string
  refresh_token?: string | null
  expires_at?: string | null
  scope?: string | null
  athlete_id?: string | null
}

/** Service-role client. Bypasses RLS, so it must never be handed to a browser. */
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}

/** Resolve the calling user from the Authorization header, or null. */
export async function userFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  )
  const { data, error } = await client.auth.getUser()
  if (error || !data?.user) return null
  return data.user.id
}

export function appUrl(): string {
  return Deno.env.get('APP_URL')?.replace(/\/$/, '') ?? 'http://localhost:5173'
}

export function callbackUrl(): string {
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing secret: ${name}`)
  return value
}

export const CONFIG = {
  strava: {
    authorizeUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token',
    // activity:read_all includes rides the athlete marked private.
    scope: 'activity:read_all,profile:read_all',
    clientId: () => requiredEnv('STRAVA_CLIENT_ID'),
    clientSecret: () => requiredEnv('STRAVA_CLIENT_SECRET'),
  },
  fitbit: {
    authorizeUrl: 'https://www.fitbit.com/oauth2/authorize',
    tokenUrl: 'https://api.fitbit.com/oauth2/token',
    scope: 'heartrate sleep weight profile activity',
    clientId: () => requiredEnv('FITBIT_CLIENT_ID'),
    clientSecret: () => requiredEnv('FITBIT_CLIENT_SECRET'),
  },
  google_health: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    // Read-only, and only the families this app actually reads.
    //
    // activity_and_fitness was added for VO2 max. Google answers 403 on the
    // vo2-max data type without it, which reads like missing data rather than a
    // missing permission — the `discover` action distinguishes the two. A
    // measured VO2 max is worth the extra consent: the app otherwise estimates
    // it from resting heart rate with Uth–Sørensen, which is a formula applied
    // to a single number.
    scope: [
      'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
      'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
      'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
    ].join(' '),
    clientId: () => requiredEnv('GOOGLE_CLIENT_ID'),
    clientSecret: () => requiredEnv('GOOGLE_CLIENT_SECRET'),
  },
} as const

/** Provider consent URL for the start of the flow. */
export function authorizeUrl(provider: Provider, state: string): string {
  const cfg = CONFIG[provider]
  const params = new URLSearchParams({
    client_id: cfg.clientId(),
    redirect_uri: callbackUrl(),
    response_type: 'code',
    state,
    scope: cfg.scope,
  })
  // Strava re-prompts on every connect unless told otherwise.
  if (provider === 'strava') params.set('approval_prompt', 'auto')

  if (provider === 'google_health') {
    // Without access_type=offline Google issues no refresh token at all, and
    // the connection silently dies the first time the access token expires.
    params.set('access_type', 'offline')
    // Google only returns a refresh token on the first consent; forcing the
    // screen guarantees one even when the user has authorised before.
    params.set('prompt', 'consent')
    params.set('include_granted_scopes', 'true')
  }

  return `${cfg.authorizeUrl}?${params.toString()}`
}

function expiryToIso(payload: Record<string, unknown>): string | null {
  // Strava returns an absolute epoch; Fitbit and Google return seconds-from-now.
  if (typeof payload.expires_at === 'number') {
    return new Date(payload.expires_at * 1000).toISOString()
  }
  if (typeof payload.expires_in === 'number') {
    return new Date(Date.now() + payload.expires_in * 1000).toISOString()
  }
  return null
}

/** Exchange an authorization code for tokens. */
export async function exchangeCode(provider: Provider, code: string): Promise<TokenSet> {
  const cfg = CONFIG[provider]
  let response: Response

  if (provider === 'strava') {
    response = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: cfg.clientId(),
        client_secret: cfg.clientSecret(),
        code,
        grant_type: 'authorization_code',
      }),
    })
  } else if (provider === 'google_health') {
    response = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId(),
        client_secret: cfg.clientSecret(),
        code,
        grant_type: 'authorization_code',
        redirect_uri: callbackUrl(),
      }),
    })
  } else {
    // Fitbit wants the client credentials as HTTP Basic, not in the body.
    const basic = btoa(`${cfg.clientId()}:${cfg.clientSecret()}`)
    response = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl(),
      }),
    })
  }

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`${provider} token exchange failed: ${JSON.stringify(payload)}`)
  }

  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? null,
    expires_at: expiryToIso(payload),
    scope: payload.scope ?? null,
    athlete_id: String(payload.athlete?.id ?? payload.user_id ?? ''),
  }
}

/** Swap a refresh token for a fresh access token. */
export async function refreshTokens(provider: Provider, refreshToken: string): Promise<TokenSet> {
  const cfg = CONFIG[provider]
  let response: Response

  if (provider === 'strava') {
    response = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: cfg.clientId(),
        client_secret: cfg.clientSecret(),
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
  } else if (provider === 'google_health') {
    response = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId(),
        client_secret: cfg.clientSecret(),
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
  } else {
    const basic = btoa(`${cfg.clientId()}:${cfg.clientSecret()}`)
    response = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    })
  }

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`${provider} token refresh failed: ${JSON.stringify(payload)}`)
  }

  return {
    access_token: payload.access_token,
    // Fitbit rotates the refresh token on every use, and Google omits it on
    // refresh entirely; keeping the old one is required in both cases.
    refresh_token: payload.refresh_token ?? refreshToken,
    expires_at: expiryToIso(payload),
    scope: payload.scope ?? null,
  }
}

/**
 * A valid access token for this user and provider, refreshing if it is close to
 * expiry. Returns null when the provider is not connected.
 */
export async function validAccessToken(
  admin: SupabaseClient,
  userId: string,
  provider: Provider,
): Promise<string | null> {
  const { data: row } = await admin
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()

  if (!row) return null

  // Refresh a minute early rather than racing the expiry mid-sync.
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0
  if (expiresAt && expiresAt - Date.now() > 60_000) return row.access_token
  if (!row.refresh_token) return row.access_token

  const fresh = await refreshTokens(provider, row.refresh_token)
  await admin
    .from('integrations')
    .update({
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token,
      expires_at: fresh.expires_at,
    })
    .eq('id', row.id)

  return fresh.access_token
}

/**
 * Decode a Google-encoded polyline into [lat, lng] pairs.
 *
 * Strava returns routes in this format. Decoding here means RouteMap can draw
 * an imported ride exactly as it draws a GPS-recorded one, with no extra
 * client-side dependency.
 */
export function decodePolyline(encoded: string): [number, number][] {
  if (!encoded) return []
  const points: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let result = 0
    let shift = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1

    result = 0
    shift = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1

    points.push([lat / 1e5, lng / 1e5])
  }

  return points
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
