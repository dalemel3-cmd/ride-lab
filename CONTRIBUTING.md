# Contributing

## Before pushing

```bash
npm run lint && npm run build
node tests/metrics.js
```

Both must pass. The UI suite (`node tests/ui.js`, needs `npm run preview` running) is worth
running for anything touching the store, a form, or the offline path.

## Conventions

- **No hardcoded tunables.** Thresholds, zones, study length, default surface — all of it lives
  in `src/settings.js` with bounds in `NUMERIC_BOUNDS`. If a component contains a magic number
  a rider might want to change, it belongs in settings.
- **No secrets in source.** Supabase config comes from `.env` only. Never add a fallback URL or
  key — a committed key cannot be rotated without a code change.
- **Missing means missing.** Coerce absent values to `null`, never `0`. `Number(null)` is `0`,
  which is finite, so a naive `Number.isFinite` guard turns a blank field into a real zero and
  poisons every average downstream.
- **Dates go through `src/data/dates.js`.** Never `new Date().toLocaleDateString()` — dates are
  resolved in the program timezone so a ride logged in another zone lands on the right day.
- **Metrics stay pure.** Anything in `src/data/metrics.js` is a pure function of its arguments,
  so it can be checked against hand-worked values in `tests/metrics.js`.
- **Touch targets ≥ 44px.** This app is used with gloves on, one-handed, out of breath. The UI
  suite asserts it.
- **Teach the offline path about new fields.** A new column has to survive the queue round-trip,
  or it will save online and vanish offline.

## Schema changes

Add a numbered file in `db/`, apply it to Supabase, *then* deploy the code that uses it. See
`db/README.md`.
