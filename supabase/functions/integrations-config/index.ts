/**
 * Reports which integration secrets are configured.
 *
 * Booleans only — never the values. This exists so the Connections card can say
 * "Google Health isn't set up yet" before you click Connect, instead of sending
 * you to a provider and failing halfway through with an opaque error.
 *
 * Kept separate from the main integrations function so it has no dependencies
 * and cannot break when that one changes.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const has = (name: string) => Boolean(Deno.env.get(name)?.trim())

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const appUrl = Deno.env.get('APP_URL')?.trim() ?? ''

  return new Response(
    JSON.stringify({
      google_health: has('GOOGLE_CLIENT_ID') && has('GOOGLE_CLIENT_SECRET'),
      strava: has('STRAVA_CLIENT_ID') && has('STRAVA_CLIENT_SECRET'),
      fitbit: has('FITBIT_CLIENT_ID') && has('FITBIT_CLIENT_SECRET'),
      ridewithgps: has('RWGPS_CLIENT_ID') && has('RWGPS_CLIENT_SECRET'),
      // Echoed because a wrong APP_URL is the failure that looks like success:
      // the connect flow completes and then lands you somewhere that is not
      // your app. Not a secret — it is the public address of the site.
      app_url: appUrl || null,
      callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`,
    }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } },
  )
})
