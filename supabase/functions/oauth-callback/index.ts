/**
 * Handles the redirect back from a provider's consent screen.
 *
 * The provider sends the browser here with ?code and ?state. The state is
 * looked up server-side to identify the user, consumed so it cannot be
 * replayed, then the code is exchanged for tokens and stored. The browser is
 * redirected back to the app with a short status in the URL — never a token.
 *
 * This function must be deployed with JWT verification off: the provider
 * redirects a bare browser here with no Authorization header.
 */

import {
  adminClient,
  appUrl,
  exchangeCode,
  type Provider,
} from '../_shared/providers.ts'

function backToApp(status: string, provider = ''): Response {
  const target = new URL(appUrl())
  target.hash = 'settings'
  target.searchParams.set('connect', status)
  if (provider) target.searchParams.set('provider', provider)
  return Response.redirect(target.toString(), 302)
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  // The user pressed "cancel" on the consent screen.
  if (url.searchParams.get('error')) return backToApp('denied')
  if (!code || !state) return backToApp('invalid')

  const admin = adminClient()

  const { data: stateRow } = await admin
    .from('oauth_states')
    .select('*')
    .eq('state', state)
    .maybeSingle()

  if (!stateRow) return backToApp('invalid')

  // Single use, whatever happens next.
  await admin.from('oauth_states').delete().eq('state', state)

  if (new Date(stateRow.expires_at).getTime() < Date.now()) return backToApp('expired')

  try {
    const provider = stateRow.provider as Provider
    const tokens = await exchangeCode(provider, code)

    const { error } = await admin.from('integrations').upsert(
      {
        user_id: stateRow.user_id,
        provider,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_at,
        scope: tokens.scope,
        athlete_id: tokens.athlete_id || null,
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' },
    )
    if (error) throw error

    return backToApp('success', provider)
  } catch (error) {
    console.error('oauth-callback failed:', error)
    return backToApp('failed', stateRow.provider)
  }
})
