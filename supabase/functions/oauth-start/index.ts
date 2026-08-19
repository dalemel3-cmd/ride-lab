/**
 * Begins an OAuth connect flow.
 *
 * Called by the app with the user's JWT. Mints a single-use state nonce tied to
 * that user, stores it server-side, and hands back the provider's consent URL.
 * The nonce is what lets the callback prove which user came back without
 * trusting anything the browser carried.
 */

import {
  adminClient,
  authorizeUrl,
  userFromRequest,
  json,
  CORS_HEADERS,
  type Provider,
} from '../_shared/providers.ts'

/**
 * Single source of truth for what may start a flow.
 *
 * This list previously repeated the provider names inline and was missed when
 * google_health was added, so the flow was rejected with a 400 before it began
 * while every other function already understood the provider.
 */
const SUPPORTED: Provider[] = ['strava', 'fitbit', 'google_health']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const userId = await userFromRequest(req)
    if (!userId) return json({ error: 'Not signed in.' }, 401)

    const { provider, redirect_to } = await req.json().catch(() => ({}))
    if (!SUPPORTED.includes(provider)) {
      // Naming what arrived turns a bare 400 into something diagnosable.
      return json(
        { error: `provider must be one of: ${SUPPORTED.join(', ')}. Received: ${provider ?? 'nothing'}.` },
        400,
      )
    }

    const admin = adminClient()
    const state = crypto.randomUUID()

    const { error } = await admin.from('oauth_states').insert({
      state,
      user_id: userId,
      provider: provider as Provider,
      redirect_to: redirect_to ?? null,
    })
    if (error) return json({ error: error.message }, 500)

    // Opportunistic cleanup — these are single-use and short-lived, and there
    // is no cron here to sweep them.
    await admin.from('oauth_states').delete().lt('expires_at', new Date().toISOString())

    return json({ url: authorizeUrl(provider as Provider, state) })
  } catch (error) {
    return json({ error: String((error as Error).message ?? error) }, 500)
  }
})
