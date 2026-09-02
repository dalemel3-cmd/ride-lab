# UI brief: make claim strength visible

**For:** an agent picking this up cold (Antigravity or similar)
**Repo:** `dalemel3-cmd/ride-lab` · branch from `main`
**Estimated scope:** one focused pass. Item 1 is the job; 2 and 3 are optional follow-ons.

---

## The problem

Ride Lab's output is handed to a bike sponsor. The numbers have to survive
someone checking them, and over the last few sessions four separate bugs were
found where the app stated something more confidently than the data supported:

- HRV read one random sample per night and reported it as the night
- HRV was compared against a baseline recorded the night after a hard benchmark
- Week and day counted from the app's install date, not the study's start
- Same-route "improvement" spanned a device change that measures the same road
  4.3% long

Each was fixed *in the data layer*, and each fix produced a flag saying how much
the number can be trusted. **The exported report uses those flags well. The
screens mostly do not.**

`src/features/progress/ProgressScreen.jsx` builds an export where every soft
claim is marked — `*(provisional — 12d of 42d history)*`, `*(not yet
interpretable — needs 28d)*`, `Establishing baseline (5 of 7 readings)`. On
screen, the same facts are shown as a bare number, an ad-hoc grey sentence, or
nothing at all, with different wording every time.

**A reader cannot tell a measured finding from a placeholder.** That is the bug.

---

## Item 1 — a single confidence component, applied everywhere

### Build it

Add to `src/components/ui.jsx` (which already exports `StatTile`, `StatGrid`,
`ScienceNote`, `EmptyState`, `ReadinessDial`, `FormStatusBadge`, `toneColor`):

```jsx
export function Confidence({ level, children }) { /* … */ }
```

Three levels, and only three — the point is that a reader learns the vocabulary
once:

| level | meaning | when |
| --- | --- | --- |
| `measured` | stands on its own | enough history, one device, real sample |
| `provisional` | real arithmetic, not yet a finding | window still filling |
| `inconclusive` | inside the noise; do not read a direction | change below a measurement floor |

Render `measured` as **nothing at all**. A badge on every number is noise, and
the absence of a qualifier has to be the signal that a number is solid. Only
`provisional` and `inconclusive` draw anything.

### Wire it to the flags that already exist

Do **not** invent new thresholds. Every one of these is already computed and
already carries its reasoning in a docstring in `src/data/metrics.js`:

| flag | source | maps to |
| --- | --- | --- |
| `maturity.ctlReady` (42d) | `ProgressScreen` / `DashboardScreen` | `provisional` |
| `maturity.acwrReady` (28d) | same | `provisional` |
| `maturity.monotonyReady` (7d) | same | `provisional` |
| `hrvBands[].baselineEstablished` | `hrvAutonomicBands` | `provisional` |
| `hrvBands[].samples` vs `MIN_HRV_BASELINE_SAMPLES` | same | the count to show |
| `preTrainingHrv().established` | `preTrainingHrv` | `provisional` at 1 night |
| `routeProgress()[].mixedSources` | `routeProgress` | context for the next row |
| `.beatsPerMile.conclusive === false` | same | `inconclusive` |
| `.speed.conclusive === false` | same | `inconclusive` |
| `CROSS_SOURCE_DISTANCE_BIAS_PCT` | `metrics.js` | the 4.3% figure to quote |
| `trendPoints` | `DashboardScreen` | `provisional` under ~3 |

`grep -rn "baselineEstablished\|acwrReady\|ctlReady\|monotonyReady\|trendPoints\|conclusive\|mixedSources\|established" src/features` finds the call sites:
roughly 15 in `DashboardScreen.jsx`, 33 in `ProgressScreen.jsx`, 5 in
`StudyReport.jsx`, 1 each in `BodyCompScreen.jsx` and `RecordRide.jsx`.

### Say why, not just that

A qualifier that reads "provisional" teaches nothing. Every one should say what
is missing and when it resolves — the export already does this and the wording
can be lifted from it verbatim:

> Needs 28 days of history, has 12.
> 5 of 7 nightly readings.
> Within device noise (±4.3%) — these two rides used different recorders.

### Acceptance

- `npm run lint && npm run build && npm test` clean, plus `node tests/ui.js`
  against `npm run preview` (see below)
- Add UI assertions to `tests/ui.js`: a provisional metric renders its qualifier,
  and a `measured` one renders no badge
- Screenshot the Dashboard and Progress at 390px wide. The badges must not wrap
  awkwardly or push stat tiles out of their grid, and the page must not scroll
  sideways — `tests/ui.js` already asserts that and will catch it
- **A number that is currently qualified must not become unqualified.** This pass
  can only add candour, never remove it

---

## Item 2 — split `ProgressScreen.jsx` (optional)

1,440 lines, and it does three jobs: the on-screen case study, the markdown
export builder (~120 lines of template literals), and the share-card trigger.
The export logic in particular is hard to review inside a render tree, and it is
the thing a sponsor actually reads.

Suggested split, no behaviour change:

- `progress/buildStudyReport.js` — pure, takes computed metrics, returns the
  markdown string. Testable in Node without a browser, which it currently is not
- `ProgressScreen.jsx` — rendering only

Do this **only** as a pure move. No logic edits in the same commit, or the diff
becomes unreviewable.

---

## Item 3 — smooth the readiness step function (optional)

Known issue, already in `HANDOFF.md`. `dailyReadiness` in `src/data/metrics.js`
scores in fixed bands, so TSB −14.9 and −15.1 land 10 points apart and the dial
jumps between visits with no real change underneath. Interpolate between band
edges instead of stepping. Keep the band *labels* — only the number moves.

---

## Ground rules

- **Read `HANDOFF.md` first**, especially "Gotchas that have already caused real
  bugs". Every entry there shipped once already
- **Dates go through `src/data/dates.js`.** Never `toISOString().slice(0,10)` —
  that reads the UTC date and the study runs on America/Chicago
- **Use the existing design tokens** in `src/styles.css` — `--status-warn`,
  `--status-success`, `--color-text-muted` and friends. Do not introduce new hex
  values. Note that the app's five heart-rate zone colours are *not* safe to
  reuse for a new categorical scale: Z4 and Z5 sit ΔE 10.6 apart in normal
  vision, below the ≥15 legibility floor, and they only work as a zone ramp
  because they are ordered and labelled
- The app is a single fixed dark theme — there is no light mode and no theme
  switch, so do not add `prefers-color-scheme` branches. There *is* a print
  stylesheet, and `tests/ui.js` asserts against it: anything new must stay legible
  as dark ink on white, since the case study gets printed
- Touch targets ≥44px, inputs at 16px (stops iOS zoom), safe-area insets respected
- No new dependencies. Charts are Recharts, icons are lucide-react, that is the
  whole toolbox
- Do not touch `supabase/functions/**` — it deploys separately and by hand

## Running it

```bash
npm install
npm run dev                  # localhost:5173
npm run lint && npm run build && npm test
npm run preview & node tests/ui.js    # Playwright, needs the preview server
```

`tests/ui.js` honours `CHROMIUM_PATH` if the bundled browser is missing.

There is no `.env` in the repo and you do not need one — `tests/ui.js` mocks
Supabase at the network layer. Do not add real credentials to run it.
