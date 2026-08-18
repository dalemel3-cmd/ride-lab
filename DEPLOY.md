# Setup and deployment

Everything the project needs is in this repository. The Supabase database, the Edge Functions, and
the Vercel project are already live — this covers getting a working copy on a new machine, and
what to do when something needs changing.

## Get it running on a new machine

```bash
git clone https://github.com/dalemel3-cmd/ride-lab.git
cd ride-lab
npm install
```

Then create a file named exactly `.env` in the project root:

```
VITE_SUPABASE_URL=https://egyxalxfvsxucwtyzvat.supabase.co
VITE_SUPABASE_ANON_KEY=<the publishable key>
```

Get the key from [supabase.com/dashboard](https://supabase.com/dashboard) → **ride-lab** →
**Settings** → **API**. Use the **publishable** key (`sb_publishable_…`) or the legacy **anon**
key — never a `service_role` or `sb_secret_` key. `VITE_` variables are compiled into the
JavaScript bundle and served to every visitor, so a secret key placed here is a public secret.

`.env` is gitignored and must stay that way.

```bash
npm run dev
```

**On Windows**, PowerShell writes the file reliably where Notepad tends to save `.env.txt`:

```powershell
Set-Content -Path .env -Value 'VITE_SUPABASE_URL=https://egyxalxfvsxucwtyzvat.supabase.co' -Encoding ascii
Add-Content -Path .env -Value 'VITE_SUPABASE_ANON_KEY=<key>' -Encoding ascii
```

Vite reads `.env` only at startup, so restart the dev server after changing it.

## Shipping a change

`main` is connected to Vercel, so a push deploys:

```bash
npm run check          # lint, build, and the metric tests
git add -A
git commit -m "..."
git push
```

Vercel builds in about 40 seconds. Watch it at [vercel.com/dashboard](https://vercel.com/dashboard).

## Tests

```bash
npm test               # metrics — pure functions, no browser needed
```

The browser suites need a server running and Playwright installed:

```bash
npm install --no-save playwright && npx playwright install chromium

npm run build && npm run preview        # leave running in another terminal
npm run test:ui                          # full app, Supabase stubbed

npm run dev                              # queue suite wants the dev server
APP_URL=http://127.0.0.1:5173 npm run test:queue
```

`CHROMIUM_PATH` overrides the browser binary if Playwright's own download is unavailable.

## Where everything lives

| Thing | Where |
| --- | --- |
| Database schema | `db/*.sql`, applied in order |
| Edge Functions | `supabase/functions/` — deployed separately, see below |
| Strava / Fitbit setup | `docs/INTEGRATIONS.md` |
| Conventions and gotchas | `CONTRIBUTING.md` |

## Changing the database

Add a new numbered file in `db/`, and apply it to Supabase **before** deploying code that uses it —
PostgREST rejects inserts naming unknown columns, so a deploy that runs ahead of its migration
fails every write. Never edit a migration that has already been applied.

## Changing an Edge Function

Editing the files under `supabase/functions/` does **not** deploy them — Vercel only builds the
front end. Deploy with the Supabase CLI:

```bash
npx supabase functions deploy integrations
```

`oauth-callback` must keep JWT verification disabled (`--no-verify-jwt`), because the OAuth
provider redirects a plain browser to it with no Authorization header.

## Secrets live in two places

Easily confused, and they behave differently:

- **Vercel** → Project Settings → Environment Variables: the two `VITE_SUPABASE_*` values. Baked
  into the bundle at build time, so changing one needs a redeploy to take effect.
- **Supabase** → Edge Functions → Secrets: `APP_URL`, plus the four `STRAVA_*` / `FITBIT_*`
  values. Read at invocation, so a change applies to the next call.

`APP_URL` must match the deployed site, or connecting Strava will send you back to the wrong place.
