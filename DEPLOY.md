# Deploying Ride Lab

The Supabase project is already live and migrated — nothing to do there. These steps only cover
getting the code onto GitHub and Vercel.

## 1. Unpack

```bash
tar -xzf ride-lab.tar.gz && cd ride-lab
npm install
```

Git history is included; the initial commit is already made.

## 2. Environment

Create `.env` (it is gitignored — never commit it):

```
VITE_SUPABASE_URL=https://egyxalxfvsxucwtyzvat.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key from Supabase -> Settings -> API>
```

Check it runs: `npm run dev`

## 3. GitHub

```bash
gh repo create ride-lab --private --source=. --push
```

Or create `ride-lab` at github.com/new, then:

```bash
git remote add origin git@github.com:dalemel3-cmd/ride-lab.git
git push -u origin main
```

## 4. Vercel

Either import the repo at vercel.com/new, or from the project directory:

```bash
npx vercel --prod
```

Vercel auto-detects Vite. **Add both environment variables** from step 2 in
Project Settings -> Environment Variables before the first production build — Vite inlines them at
build time, so a build without them produces an app that cannot reach the database.

## 5. Install on your phone

Open the deployed URL in Safari or Chrome -> Share -> **Add to Home Screen**. It launches
standalone, works offline, and queues rides written in dead zones until signal returns.

## First run

Create your account on the login screen (sign up, confirm by email, sign in). The Bentonville
route library seeds itself automatically. Before your first ride, go to **Body** and record a
baseline measurement, and set your max HR and study start date in **Settings** — every zone and
every trend is calculated from those.
