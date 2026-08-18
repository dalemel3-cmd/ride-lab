# Strava and Fitbit

Rides come from Strava. Resting heart rate, weight, body fat and sleep come from Fitbit. Both
run through Supabase Edge Functions so the API secrets never reach the browser.

**Apple Health is not supported and cannot be.** HealthKit is on-device only — there is no web
API at any price. Reading it requires a native iOS app. Google Fit is also absent on purpose: its
REST API is deprecated, and the replacement (Health Connect) is Android-on-device only.

---

## What is already done

- `db/002_integrations.sql` applied
- Edge Functions `oauth-start`, `oauth-callback`, `integrations` deployed and active
- **Connections** card built into Settings

What remains is registering two developer apps — only you can do that — and setting four secrets.

## 1. Register a Strava app

1. Go to <https://www.strava.com/settings/api>
2. Create an app. Any name works; "Ride Lab" is fine.
3. Set **Authorization Callback Domain** to exactly:

   ```
   egyxalxfvsxucwtyzvat.supabase.co
   ```

   Domain only — no `https://`, no path. Strava rejects the flow if this does not match.
4. Copy the **Client ID** and **Client Secret**.

## 2. Register a Fitbit app

1. Go to <https://dev.fitbit.com/apps/new>
2. **OAuth 2.0 Application Type** must be **Server** — this is the setting people get wrong.
   Client/Personal types do not issue the refresh tokens this needs.
3. **Redirect URL**, exactly:

   ```
   https://egyxalxfvsxucwtyzvat.supabase.co/functions/v1/oauth-callback
   ```

4. **Default Access Type**: Read Only.
5. Copy the **OAuth 2.0 Client ID** and **Client Secret**.

## 3. Set the secrets

Supabase dashboard → your project → **Edge Functions** → **Secrets**. Add five:

| Name | Value |
| --- | --- |
| `STRAVA_CLIENT_ID` | from step 1 |
| `STRAVA_CLIENT_SECRET` | from step 1 |
| `FITBIT_CLIENT_ID` | from step 2 |
| `FITBIT_CLIENT_SECRET` | from step 2 |
| `APP_URL` | where the app runs — `http://localhost:5173` while developing, your Vercel URL once deployed |

`APP_URL` is where the OAuth callback sends the browser back to. Point it at the wrong place and
the connect flow completes but dumps you somewhere unexpected. Update it when you deploy.

## 4. Connect

Sign in, open **Settings → Connections**, and click Connect. You will be sent to Strava or Fitbit
to approve, then returned to the app. Then **Sync now**.

The default window is 60 days. Syncing again is always safe — rides are keyed on
`(source, external_id)` and body and journal rows on `(date, source)`, so re-importing updates
what already exists rather than duplicating it.

---

## What comes across

**Strava** → distance, moving time, elevation, average and max heart rate, start time, and the
GPS route (decoded from the polyline, drawn exactly like a ride recorded in the app). Rides only
— runs and walks are filtered out. Sport type maps onto surface: MountainBikeRide becomes
singletrack, GravelRide becomes gravel, Ride becomes road.

`moving_time` is used rather than `elapsed_time`, deliberately: a training log should not count
the twenty minutes you spent at Airship as riding.

**Fitbit** → resting heart rate, weight, body fat (each becoming a Body measurement), and sleep
hours (becoming a Journal entry).

## What does not come across, and why

**RPE.** No API knows how hard something felt, and inferring it from heart rate would fabricate
the most important subjective number in the study. Imported rides show an **Add RPE** button so
they are easy to find and finish.

**Baselines.** Fitbit rows are never marked as the study baseline. That is a deliberate decision
about when the study starts, not whichever day happened to sync first. Set it yourself in Body.

**Your journal.** A synced sleep figure never overwrites something you wrote, and a hand-entered
RPE survives every future sync.

## Security

`integrations` and `oauth_states` have RLS enabled with **no policies at all**, which denies every
request made with the anon key. Only the Edge Functions, using the service-role key, can read
them. The browser can learn that a provider is connected and when it last synced; it can never
read a token.

The Supabase linter reports these two tables as "RLS enabled, no policy". That is the intended
configuration, not an oversight.

The `state` parameter is a single-use nonce stored server-side with a ten-minute expiry, so the
callback can prove which user began the flow without trusting anything the browser carried.

## Troubleshooting

**"Missing secret: STRAVA_CLIENT_ID"** — the secrets in step 3 are not set, or were added after
the last deploy. Functions pick up secrets on the next invocation, so just try again.

**Strava returns "invalid redirect_uri"** — the Authorization Callback Domain is wrong. Domain
only, no scheme or path.

**Fitbit returns "invalid_client"** — usually the app type. It must be **Server**.

**Connected, but "Sync now" imports nothing** — check the window. The default is 60 days; a ride
older than that will not appear. Also confirm the activity is a ride, not a run.

**Connection stops working after a while** — the authorisation was revoked at the provider.
Disconnect and reconnect.
