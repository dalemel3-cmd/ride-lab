/**
 * Pure generator for the Markdown Case Study export.
 *
 * Extracted from ProgressScreen so the report builder is testable in Node
 * without a browser and reviewable in isolation from React rendering.
 */

import { formatDuration } from '../../data/dates.js'
import { MIN_HRV_BASELINE_SAMPLES } from '../../data/metrics.js'

export function buildStudyReport({
  currentWeek,
  settings = {},
  maturity = {},
  totals = {},
  substrateTotals = {},
  polarizedStudyAudit,
  efficiencyTrend,
  surfaceLabel,
  latestPmc,
  latestAcwr,
  monotonyStats,
  latestBody,
  hrvReference,
  latestHrvBand,
  routeGains = [],
}) {
  const provisional = (ready, needDays) =>
    ready ? '' : ` *(provisional — ${maturity.days ?? 0}d of ${needDays}d history)*`

  const pmcBlock = latestPmc
    ? [
        `- **Fitness (CTL - 42d):** ${latestPmc.ctl}${provisional(maturity.ctlReady, 42)}`,
        `- **Fatigue (ATL - 7d):** ${latestPmc.atl}`,
        // TSB is CTL minus ATL, so its label is only meaningful once CTL is
        // real. Early on the status just restates "you rode recently".
        `- **Form (TSB):** ${latestPmc.tsb}${
          maturity.ctlReady ? ` (${latestPmc.status})` : provisional(false, 42)
        }`,
        // Printed without its verdict until the chronic window exists. Two
        // adjacent lines contradicting each other — "Danger Zone" beside
        // "Optimal Progressive Overload" — is what made this read as noise.
        `- **ACWR (Gabbett Ratio):** ${latestAcwr?.ratio ?? '—'}${
          maturity.acwrReady
            ? ` (${latestAcwr?.label ?? 'Awaiting data'})`
            : ` *(not yet interpretable — needs 28d of history, has ${maturity.days ?? 0}d)*`
        }`,
        `- **Foster Monotony (7d):** ${monotonyStats?.monotony ?? '—'} (Strain: ${
          monotonyStats?.strain ?? '—'
        })${provisional(maturity.monotonyReady, 7)}`,
      ].join('\n')
    : `- No load history available.`

  const autonomicLine = latestHrvBand
    ? latestHrvBand.baselineEstablished
      ? latestHrvBand.autonomicState
      : `Establishing baseline (${latestHrvBand.samples} of ${MIN_HRV_BASELINE_SAMPLES} readings)`
    : 'Not measured'

  const lines = [
    `# 16-Week Cycling Physiological Case Study Report`,
    `**Generated:** ${new Date().toISOString().slice(0, 10)} | **Study Week:** ${currentWeek} of ${settings.caseStudyWeeks ?? 16}`,
    ``,
    // Stated once, at the top, so no reader has to infer it from a number
    // that looks alarming.
    (maturity.days ?? 0) < 42
      ? `> **Data maturity:** ${maturity.days ?? 0} day${(maturity.days ?? 0) === 1 ? '' : 's'} of ride history across ${totals.rides ?? 0} ride${(totals.rides ?? 0) === 1 ? '' : 's'}. Load models below marked *provisional* are still filling their windows and should not be read as findings yet.\n`
      : ``,
    `## 1. Executive Summary & Telemetry`,
    `- **Total Rides:** ${totals.rides ?? 0}`,
    `- **Total Distance:** ${totals.distanceMi ?? 0} miles`,
    `- **Total Saddle Time:** ${formatDuration(totals.durationMin ?? 0)}`,
    `- **Total Elevation Climbed:** ${(totals.elevationFt ?? 0).toLocaleString()} ft`,
    `- **Estimated Energy Burned:** ${(substrateTotals.totalKcal ?? 0).toLocaleString()} kcal (${substrateTotals.fatGrams ?? 0}g Fat [~${substrateTotals.fatPounds ?? '0.00'} lbs] / ${substrateTotals.carbGrams ?? 0}g Carbs)`,
    ``,
    `## 2. Training Intensity Distribution (Seiler 3-Domain Model)`,
    polarizedStudyAudit
      ? [
          `- **Distribution:** ${polarizedStudyAudit.lowPct}% Low (Z1+Z2) / ${polarizedStudyAudit.modPct}% Mod (Z3) / ${polarizedStudyAudit.highPct}% High (Z4+Z5)`,
          // A distribution over one ride is that ride, not a training
          // pattern, and naming an archetype off it overstates the evidence.
          `- **Basis:** ${maturity.ridesWithContinuousHr ?? 0} of ${totals.rides ?? 0} ride${(totals.rides ?? 0) === 1 ? '' : 's'} carry continuous heart rate`,
          `- **Archetype:** ${polarizedStudyAudit.label} (${polarizedStudyAudit.archetype})${
            (maturity.ridesWithContinuousHr ?? 0) < 3
              ? ` *(provisional — describes ${(maturity.ridesWithContinuousHr ?? 0) === 1 ? 'a single ride' : 'a handful of rides'}, not a training pattern)*`
              : ''
          }`,
          `- **Guidance:** ${polarizedStudyAudit.description}`,
        ].join('\n')
      : `- No continuous HR track distribution available.`,
    ``,
    `## 3. Aerobic Decoupling & Efficiency (${surfaceLabel || 'Primary Surface'})`,
    efficiencyTrend
      ? `- **Initial Efficiency:** ${efficiencyTrend.first} beats/mile\n- **Current Efficiency:** ${efficiencyTrend.last} beats/mile\n- **Net Adaptation:** ${efficiencyTrend.change} beats/mile (${efficiencyTrend.pctChange}% change)`
      : `- Insufficient single-surface rides recorded yet.`,
    ``,
    `## 4. Banister Performance Management & Workload Safety`,
    pmcBlock,
    latestBody
      ? `- **Current Resting HR:** ${latestBody.resting_hr != null ? `${latestBody.resting_hr} bpm` : '—'}\n- **Current HRV (rMSSD):** ${latestBody.hrv_ms != null ? `${latestBody.hrv_ms} ms` : '—'}${
          hrvReference
            ? `\n- **Pre-training HRV reference:** ${hrvReference.ms} ms (mean of ${hrvReference.nights} night${hrvReference.nights === 1 ? '' : 's'} before the first ride, ${hrvReference.from}${hrvReference.from !== hrvReference.to ? ` – ${hrvReference.to}` : ''}). Used instead of the baseline measurement because rMSSD recorded the night after a hard effort reflects that effort, not the resting state.`
            : ''
        }\n- **Autonomic Status:** ${autonomicLine}`
      : ``,
    ``,
    `## 5. Repeated Route Progress (Identical Course Control)`,
    routeGains.length > 0
      ? routeGains
          .map(
            (r) =>
              `### ${r.route} (${r.rides}x)\n- Dates: ${r.firstDate} → ${r.latestDate}\n- Speed: ${r.speed?.first ?? '—'} → ${r.speed?.latest ?? '—'} mph${r.speed?.conclusive === false ? ' *(within device noise — not conclusive)*' : ''}\n- Cardiac Cost: ${r.beatsPerMile?.first ?? '—'} → ${r.beatsPerMile?.latest ?? '—'} beats/mi${r.beatsPerMile?.conclusive === false ? ' *(within device noise — not conclusive)*' : ''}${
                r.mixedSources
                  ? `\n- **Recording caveat:** these rides were logged by different devices (${r.sources.join(', ')}). On identical ground the two measured distances differing by ~${r.noiseFloorPct}%, and both figures above are distance-sensitive, so changes smaller than that are measurement rather than adaptation.`
                  : ''
              }`,
          )
          .join('\n\n')
      : `- No route ridden twice yet. Repeating one course is the cleanest control the study has: same distance, same climbing, same surface, so a change in speed or beats-per-mile is adaptation rather than a different day out.`,
    ``,
  ]

  return lines.join('\n')
}
