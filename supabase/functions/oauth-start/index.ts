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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const userId = await userFromRequest(req)
    if (!userId) return json({ error: 'Not signed in.' }, 401)

    const { provider, redirect_to } = await req.json().catch(() => ({}))
    if (provider !== 'strava' && provider !== 'fitbit') {
      return json({ error: 'provider must be "strava" or "fitbit".' }, 400)
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
