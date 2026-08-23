import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from 'recharts'
import { Download, Flame } from 'lucide-react'
import {
  weeklyRollup,
  summarize,
  efficiencyBySurface,
  routeProgress,
  hrZoneRanges,
  performanceManagementChart,
  hrvAutonomicBands,
  MIN_HRV_BASELINE_SAMPLES,
  dailyReadiness,
  substrateOxidation,
  timeInZones,
  combineZoneTimes,
  acwr,
  weeklyMonotony,
  polarizedAudit,
} from '../../data/metrics.js'
import {
  formatShortDate,
  formatDuration,
  studyWeek,
  toDateString,
  daysBetween,
  recordDate,
} from '../../data/dates.js'
import { StatGrid, StatTile, ScienceNote, EmptyState, ReadinessDial, FormStatusBadge } from '../../components/ui.jsx'
import ZoneBar from '../../components/ZoneBar.jsx'
import PolarizedGauge from '../../components/PolarizedGauge.jsx'
import StudyReadiness from '../../components/StudyReadiness.jsx'
import StudyHeadline from '../../components/StudyHeadline.jsx'

const CHART_MARGIN = { top: 4, right: 8, left: -20, bottom: 0 }

const tooltipStyle = {
  background: 'rgba(11, 26, 43, 0.95)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-text)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
}

export default function ProgressScreen({ rides, bodyComp, settings }) {
  const totals = useMemo(() => summarize(rides), [rides])
  const weeks = useMemo(() => weeklyRollup(rides), [rides])

  // Oldest-first, and only rides carrying the fields each chart needs.
  const chronological = useMemo(
    () => [...rides].sort((a, b) => a.ridden_at.localeCompare(b.ridden_at)),
    [rides],
  )

  // Split by surface
  const bySurface = useMemo(() => efficiencyBySurface(rides), [rides])
  const primarySurface = bySurface[0] ?? null
  const routeGains = useMemo(() => routeProgress(rides), [rides])

  // Performance Management Chart (PMC)
  const pmcSeries = useMemo(
    () => performanceManagementChart(rides, { defaultMaxHr: settings.maxHr }),
    [rides, settings.maxHr],
  )
  const latestPmc = pmcSeries[pmcSeries.length - 1] ?? null

  // Acute:Chronic Workload Ratio (ACWR) & Periodization Stats
  const acwrSeries = useMemo(
    () => pmcSeries.filter((p) => p.acwr !== null),
    [pmcSeries],
  )
  const latestAcwr = useMemo(
    () =>
      latestPmc?.atl != null && latestPmc?.ctl != null
        ? acwr(latestPmc.atl, latestPmc.ctl)
        : null,
    [latestPmc],
  )
  const monotonyStats = useMemo(
    () => weeklyMonotony(rides, { defaultMaxHr: settings.maxHr }),
    [rides, settings.maxHr],
  )

  // HRV Autonomic Bands
  const hrvBands = useMemo(() => hrvAutonomicBands(bodyComp), [bodyComp])
  const latestHrvBand = hrvBands[hrvBands.length - 1] ?? null

  // Baseline & Latest Body Comp
  const sortedBody = useMemo(
    () => [...bodyComp].sort((a, b) => a.measured_at.localeCompare(b.measured_at)),
    [bodyComp],
  )
  const baselineBody = useMemo(
    () => sortedBody.find((m) => m.is_baseline) ?? sortedBody[0] ?? null,
    [sortedBody],
  )
  const latestBody = sortedBody[sortedBody.length - 1] ?? null

  // Daily Readiness HUD Score
  const readiness = useMemo(
    () =>
      dailyReadiness({
        hrv: latestBody?.hrv_ms != null ? Number(latestBody.hrv_ms) : null,
        hrvBaseline: latestHrvBand?.baselineHrv ?? (baselineBody?.hrv_ms != null ? Number(baselineBody.hrv_ms) : null),
        restingHr: latestBody?.resting_hr != null ? Number(latestBody.resting_hr) : null,
        restingHrBaseline: baselineBody?.resting_hr != null ? Number(baselineBody.resting_hr) : null,
        // Null, not 0 — see DashboardScreen. An absent training balance must
        // not contribute a score of its own.
        recentTsb: latestPmc?.tsb ?? null,
      }),
    [latestBody, baselineBody, latestHrvBand, latestPmc],
  )

  // Intensity distribution across every ride whose track carries heart rate.
  const studyZones = useMemo(
    () => combineZoneTimes(rides.map((r) => timeInZones(r.track, settings.maxHr))),
    [rides, settings.maxHr],
  )

  const polarizedStudyAudit = useMemo(
    () => (studyZones ? polarizedAudit(studyZones) : null),
    [studyZones],
  )

  // What the study can measure yet, and what each gap costs. Ordered by value,
  // not by convenience: heart rate outranks a second ride.
  const coverage = useMemo(() => {
    const ridesWithHr = rides.filter(
      (r) => r.avg_hr != null || (Array.isArray(r.track) && r.track.some((p) => p?.[4] != null)),
    ).length
    const repeatedGround = routeGains.length > 0

    return [
      {
        label: 'A logged ride',
        done: rides.length > 0,
        enables: `${rides.length} logged. Volume, duration and training load are running.`,
        blocks: 'Nothing can be measured until the first ride is logged or imported.',
      },
      {
        label: 'Heart rate on a ride',
        done: ridesWithHr > 0,
        enables: `${ridesWithHr} of ${rides.length} rides carry heart rate.`,
        blocks:
          'The largest gap. No beats-per-mile, no time in zones, no training impulse — so effort cannot be separated from fitness. Pair a strap when recording, or export a file that includes heart rate.',
      },
      {
        label: 'The same ground twice',
        done: repeatedGround,
        enables: `${routeGains.length} repeated ${routeGains.length === 1 ? 'route' : 'routes'} to compare.`,
        blocks:
          'Ride a route again and terrain stops being a variable — the cleanest evidence this study can produce.',
      },
      {
        label: 'A marked body-composition baseline',
        done: bodyComp.some((m) => m.is_baseline),
        enables: 'Every body trend is measured from the day you chose.',
        blocks:
          'Comparisons fall back to your oldest measurement, which may predate the study. Set one on the Body screen.',
      },
      {
        label: 'Resting heart rate',
        done: bodyComp.some((m) => m.resting_hr != null),
        enables: 'Estimated VO₂ max and autonomic trend are available.',
        blocks: 'Without it there is no VO₂ max estimate and no recovery signal.',
      },
    ]
  }, [rides, routeGains, bodyComp])

  // Total Estimated Substrate Oxidation
  const substrateTotals = useMemo(() => {
    let fatGrams = 0
    let carbGrams = 0
    let totalKcal = 0
    for (const r of rides) {
      if (r.avg_hr && r.duration_min) {
        const sub = substrateOxidation(r.avg_hr, r.duration_min, settings.maxHr)
        if (sub) {
          fatGrams += sub.fatGrams
          carbGrams += sub.carbGrams
          totalKcal += sub.totalKcal
        }
      }
    }
    return {
      fatGrams: Math.round(fatGrams),
      carbGrams: Math.round(carbGrams),
      totalKcal: Math.round(totalKcal),
      fatPounds: (fatGrams / 453.592).toFixed(2),
    }
  }, [rides, settings.maxHr])

  const efficiencySeries = useMemo(
    () =>
      (primarySurface?.points ?? []).map((p) => ({
        date: formatShortDate(p.date),
        beatsPerMile: p.beatsPerMile,
        route: p.route,
      })),
    [primarySurface],
  )

  const rpeVsHr = useMemo(
    () =>
      chronological
        .filter((r) => r.rpe != null && r.avg_hr != null)
        .map((r, index) => ({
          rpe: Number(r.rpe),
          avgHr: Number(r.avg_hr),
          order: index,
          date: formatShortDate(recordDate(r)),
        })),
    [chronological],
  )

  const efficiencyTrend = primarySurface?.trend ?? null
  const surfaceLabel = (primarySurface?.surface ?? '').replace('-', ' ')

  const studyStart = settings.caseStudyStartDate
  const daysIn = Math.max(0, daysBetween(studyStart, toDateString()))
  const currentWeek = Math.min(studyWeek(studyStart, toDateString()), settings.caseStudyWeeks)
  const progressPct = Math.min(100, Math.round((daysIn / (settings.caseStudyWeeks * 7)) * 100))

  const zoneRanges = hrZoneRanges(settings.maxHr)
  const midpoint = Math.floor(rpeVsHr.length / 2)
  const firstHalf = rpeVsHr.slice(0, midpoint)
  const secondHalf = rpeVsHr.slice(midpoint)

  // How much history each model actually has to work with.
  //
  // The Banister and Gabbett models are ratios against a long-run average, and
  // in the opening weeks that average is mostly zeros. The arithmetic still
  // produces a number — an ACWR of 5.15 labelled "Danger Zone" in week one, off
  // two easy rides — but that number describes an empty denominator, not the
  // rider. Anyone who knows the models spots it and discounts the whole
  // document, so a figure below its window is reported as provisional rather
  // than asserted as a finding.
  const maturity = useMemo(() => {
    const firstRide = chronological[0]
    const days = firstRide ? daysBetween(recordDate(firstRide), toDateString()) + 1 : 0
    const ridesWithContinuousHr = rides.filter(
      (r) => Array.isArray(r.track) && r.track.some((p) => p?.[4] != null),
    ).length
    return {
      days,
      ridesWithContinuousHr,
      // CTL is a 42-day exponential average; ACWR compares 7 days against 28.
      ctlReady: days >= 42,
      acwrReady: days >= 28,
      monotonyReady: days >= 7,
    }
  }, [chronological, rides])

  // The findings, in the order someone actually wants them: what riding is
  // doing to the body first, what the training looks like second. The charts
  // below are the working; this is the answer.
  //
  // Every row is gated by the same `maturity` the export uses, so the screen
  // and the exported document can never disagree about what is known yet.
  const headline = useMemo(() => {
    const items = []

    // 1. Aerobic efficiency. The single clearest adaptation signal a rider can
    // see in four months: fewer heartbeats to cover the same mile.
    if (efficiencyTrend) {
      const better = efficiencyTrend.change < 0
      items.push({
        key: 'efficiency',
        label: `Cardiac cost — ${surfaceLabel || 'primary surface'}`,
        value: efficiencyTrend.last,
        unit: 'beats/mi',
        tone: better ? 'good' : 'warn',
        note: better
          ? `Down ${Math.abs(efficiencyTrend.change)} beats/mile from ${efficiencyTrend.first} (${efficiencyTrend.pctChange}%). Your heart is doing the same work for fewer beats — the clearest sign the training is landing.`
          : `Up ${Math.abs(efficiencyTrend.change)} beats/mile from ${efficiencyTrend.first} (${efficiencyTrend.pctChange}%). Harder terrain, heat, or fatigue all read this way, so watch the trend rather than one ride.`,
        pending: totals.rides < 4 ? `Only ${totals.rides} rides on this surface — treat as an early read` : null,
      })
    } else {
      items.push({
        key: 'efficiency',
        label: 'Cardiac cost',
        value: null,
        tone: 'neutral',
        note: 'Needs two rides on the same surface with average heart rate recorded. This is the headline number of the whole study.',
      })
    }

    // 2. Body composition against the baseline the rider chose.
    if (baselineBody && latestBody && baselineBody !== latestBody) {
      const fatFrom = baselineBody.body_fat_pct
      const fatTo = latestBody.body_fat_pct
      const weightFrom = baselineBody.weight_lbs
      const weightTo = latestBody.weight_lbs

      if (fatFrom != null && fatTo != null) {
        const change = Math.round((fatTo - fatFrom) * 10) / 10
        items.push({
          key: 'bodyfat',
          label: 'Body fat vs. baseline',
          value: fatTo,
          unit: '%',
          tone: change < 0 ? 'good' : 'neutral',
          note: `${change === 0 ? 'Unchanged' : `${change > 0 ? '+' : ''}${change} points`} from ${fatFrom}% at baseline${
            weightFrom != null && weightTo != null
              ? `, on ${weightTo} lbs (${Math.round((weightTo - weightFrom) * 10) / 10 > 0 ? '+' : ''}${Math.round((weightTo - weightFrom) * 10) / 10} lbs)`
              : ''
          }. Composition moving while weight sits still is the normal early pattern.`,
        })
      } else if (weightFrom != null && weightTo != null) {
        const change = Math.round((weightTo - weightFrom) * 10) / 10
        items.push({
          key: 'weight',
          label: 'Weight vs. baseline',
          value: weightTo,
          unit: 'lbs',
          tone: 'neutral',
          note: `${change > 0 ? '+' : ''}${change} lbs from ${weightFrom}. Weight alone can stay flat for months while body composition shifts underneath it — the scale's body-fat reading is the one to watch.`,
        })
      }
    }

    // 3. Resting heart rate: the cheapest, most honest long-run marker there is.
    if (latestBody?.resting_hr != null) {
      const from = baselineBody?.resting_hr
      const change = from != null ? Math.round(latestBody.resting_hr - from) : null
      items.push({
        key: 'resting-hr',
        label: 'Resting heart rate',
        value: latestBody.resting_hr,
        unit: 'bpm',
        tone: change != null && change < 0 ? 'good' : 'neutral',
        note:
          change == null
            ? 'Mark a baseline measurement in Body and this starts reading as a trend rather than a number.'
            : `${change === 0 ? 'Unchanged' : `${change > 0 ? '+' : ''}${change} bpm`} from ${from} at baseline. A resting rate drifting down over months is aerobic adaptation you can feel in daily life, not just on the bike.`,
      })
    }

    // 4. Autonomic state, only once its baseline exists. Before that the bands
    // are narrower than the day-to-day noise and every reading trips a verdict.
    if (latestHrvBand) {
      items.push({
        key: 'hrv',
        label: 'HRV (rMSSD)',
        value: latestHrvBand.hrv,
        unit: 'ms',
        tone: latestHrvBand.baselineEstablished ? latestHrvBand.tone : 'neutral',
        note: latestHrvBand.baselineEstablished
          ? `${latestHrvBand.autonomicState}. Baseline ${latestHrvBand.baselineHrv} ms, normal range ${latestHrvBand.lowerBand}–${latestHrvBand.upperBand} ms.`
          : 'Building the rolling baseline. Until there are seven readings the normal range is narrower than ordinary day-to-day variation, so no autonomic verdict is worth printing.',
        pending: latestHrvBand.baselineEstablished
          ? null
          : `${latestHrvBand.samples} of ${MIN_HRV_BASELINE_SAMPLES} readings`,
      })
    }

    // 5. Training load. Last, because it describes the input rather than the
    // result, and because it is the part that takes six weeks to mean anything.
    if (latestPmc) {
      items.push({
        key: 'load',
        label: 'Fitness (CTL)',
        value: latestPmc.ctl,
        tone: 'neutral',
        note: maturity.ctlReady
          ? `Form ${latestPmc.tsb} (${latestPmc.status}). Fitness is a 42-day average of training load; form is that minus recent fatigue.`
          : `Form ${latestPmc.tsb}. Fitness is a 42-day rolling average, so this figure is still mostly made of the days before you started riding — it climbs on its own as the window fills.`,
        pending: maturity.ctlReady ? null : `${maturity.days} of 42 days`,
      })
    }

    return items
  }, [
    efficiencyTrend,
    surfaceLabel,
    totals.rides,
    baselineBody,
    latestBody,
    latestHrvBand,
    latestPmc,
    maturity,
  ])

  function handleExportCaseStudy() {
    const provisional = (ready, needDays) =>
      ready ? '' : ` *(provisional — ${maturity.days}d of ${needDays}d history)*`

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
              : ` *(not yet interpretable — needs 28d of history, has ${maturity.days}d)*`
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
      `**Generated:** ${new Date().toISOString().slice(0, 10)} | **Study Week:** ${currentWeek} of ${settings.caseStudyWeeks}`,
      ``,
      // Stated once, at the top, so no reader has to infer it from a number
      // that looks alarming.
      maturity.days < 42
        ? `> **Data maturity:** ${maturity.days} day${maturity.days === 1 ? '' : 's'} of ride history across ${totals.rides} ride${totals.rides === 1 ? '' : 's'}. Load models below marked *provisional* are still filling their windows and should not be read as findings yet.\n`
        : ``,
      `## 1. Executive Summary & Telemetry`,
      `- **Total Rides:** ${totals.rides}`,
      `- **Total Distance:** ${totals.distanceMi} miles`,
      `- **Total Saddle Time:** ${formatDuration(totals.durationMin)}`,
      `- **Total Elevation Climbed:** ${totals.elevationFt.toLocaleString()} ft`,
      `- **Estimated Energy Burned:** ${substrateTotals.totalKcal.toLocaleString()} kcal (${substrateTotals.fatGrams}g Fat [~${substrateTotals.fatPounds} lbs] / ${substrateTotals.carbGrams}g Carbs)`,
      ``,
      `## 2. Training Intensity Distribution (Seiler 3-Domain Model)`,
      polarizedStudyAudit
        ? [
            `- **Distribution:** ${polarizedStudyAudit.lowPct}% Low (Z1+Z2) / ${polarizedStudyAudit.modPct}% Mod (Z3) / ${polarizedStudyAudit.highPct}% High (Z4+Z5)`,
            // A distribution over one ride is that ride, not a training
            // pattern, and naming an archetype off it overstates the evidence.
            `- **Basis:** ${maturity.ridesWithContinuousHr} of ${totals.rides} ride${totals.rides === 1 ? '' : 's'} carry continuous heart rate`,
            `- **Archetype:** ${polarizedStudyAudit.label} (${polarizedStudyAudit.archetype})${
              maturity.ridesWithContinuousHr < 3
                ? ` *(provisional — describes ${maturity.ridesWithContinuousHr === 1 ? 'a single ride' : 'a handful of rides'}, not a training pattern)*`
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
        ? // Units only where there is a value to carry them: "— ms" reads like a
          // failed measurement rather than an absent one.
          `- **Current Resting HR:** ${latestBody.resting_hr != null ? `${latestBody.resting_hr} bpm` : '—'}\n- **Current HRV (rMSSD):** ${latestBody.hrv_ms != null ? `${latestBody.hrv_ms} ms` : '—'}\n- **Autonomic Status:** ${autonomicLine}`
        : ``,
      ``,
      `## 5. Repeated Route Progress (Identical Course Control)`,
      // Every other section states what it cannot measure yet. This one used to
      // spread an empty list under its heading, so the whole export ended on a
      // bare title and read as a truncated file.
      routeGains.length > 0
        ? routeGains
            .map(
              (r) =>
                `### ${r.route} (${r.rides}x)\n- Dates: ${r.firstDate} → ${r.latestDate}\n- Speed: ${r.speed?.first ?? '—'} → ${r.speed?.latest ?? '—'} mph\n- Cardiac Cost: ${r.beatsPerMile?.first ?? '—'} → ${r.beatsPerMile?.latest ?? '—'} beats/mi`,
            )
            .join('\n\n')
        : `- No route ridden twice yet. Repeating one course is the cleanest control the study has: same distance, same climbing, same surface, so a change in speed or beats-per-mile is adaptation rather than a different day out.`,
      ``,
    ]

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cycling-case-study-week-${currentWeek}-${toDateString()}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (rides.length === 0) {
    return (
      <div className="screen">
        <div className="screen-header">
          <h2>Progress</h2>
        </div>
        <EmptyState>
          Log a few rides and this page fills in: PMC fitness tracking, HRV autonomic balance, and aerobic decoupling.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Progress</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={handleExportCaseStudy}
            style={{ padding: '8px 14px' }}
            title="Download formatted Case Study Markdown Report"
          >
            <Download size={16} aria-hidden="true" /> Export Study
          </button>
          <span className="muted" style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
            W{currentWeek}/{settings.caseStudyWeeks}
          </span>
        </div>
      </div>

      {/* The findings, before the instrumentation. Everything below this card
          is the evidence for it. */}
      <StudyHeadline
        maturity={`${maturity.days}d · ${totals.rides} ride${totals.rides === 1 ? '' : 's'}`}
        items={headline}
      />

      {/* Cyber-Athletic Readiness & Recovery HUD */}
      <StudyReadiness items={coverage} />

      <ReadinessDial readiness={readiness} />

      {/* Intensity distribution across the whole study. Only appears once some
          ride carries per-point heart rate — there is nothing to distribute
          otherwise, and five empty bars would imply a measurement. */}
      {studyZones && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {polarizedStudyAudit && (
            <PolarizedGauge
              audit={polarizedStudyAudit}
              title="16-Week Polarized Training Audit"
              subtitle="Dr. Stephen Seiler 3-Domain Intensity Distribution"
            />
          )}

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h4 style={{ fontSize: 'var(--text-sm)', margin: 0 }}>5-Zone Granular Breakdown</h4>
            <ZoneBar distribution={studyZones} height={14} />
          </div>

          <ScienceNote title="Dr. Stephen Seiler's 80/20 Polarized Model">
            Endurance physiology research across elite cyclists and runners demonstrates that roughly{' '}
            <strong>80% of training time should remain low intensity</strong> (Zones 1–2 / below LT₁) and{' '}
            <strong>20% high intensity</strong> (Zones 4–5 / above LT₂), with minimal time spent in Zone 3.
            <br />
            <br />
            <strong>The Grey Zone Trap:</strong> Riders often ride easy days too hard (drifting into Zone 3 tempo) and hard days too exhausted to reach Zone 5. 
            Staying disciplined in Zone 1–2 builds mitochondrial density and capillary beds while preserving the autonomic capacity required to execute true high-intensity intervals.
          </ScienceNote>
        </section>
      )}

      {/* Study progress bar */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
          <span className="muted">Started {formatShortDate(studyStart)}</span>
          <span className="muted">{progressPct}%</span>
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 999,
            background: 'var(--color-surface-raised)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              background: 'var(--color-accent)',
            }}
          />
        </div>
      </div>

      <StatGrid>
        <StatTile label="Rides" value={totals.rides} />
        <StatTile label="Distance" value={totals.distanceMi} unit="mi" />
        <StatTile label="Time" value={formatDuration(totals.durationMin)} />
        <StatTile label="Climbing" value={totals.elevationFt.toLocaleString()} unit="ft" />
        <StatTile
          label="Avg speed"
          value={totals.avgSpeed ? totals.avgSpeed.toFixed(1) : null}
          unit="mph"
        />
        <StatTile label="Total load" value={totals.load.toLocaleString()} />
      </StatGrid>

      {/* ---------------------------------------------------------------- */}
      {/* Performance Management Chart (PMC: CTL / ATL / TSB)               */}
      {/* ---------------------------------------------------------------- */}
      {pmcSeries.length > 2 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ fontSize: 'var(--text-lg)' }}>Performance Management (PMC)</h3>
              <span className="muted">Banister Impulse-Response: Fitness (CTL) vs Fatigue (ATL)</span>
            </div>
            {latestPmc && <FormStatusBadge status={latestPmc.status} tone={latestPmc.tone} />}
          </div>

          {latestPmc && (
            <StatGrid min={110}>
              <StatTile label="Fitness (CTL)" value={latestPmc.ctl} unit="42d" />
              <StatTile label="Fatigue (ATL)" value={latestPmc.atl} unit="7d" />
              <StatTile
                label="Form (TSB)"
                value={latestPmc.tsb > 0 ? `+${latestPmc.tsb}` : latestPmc.tsb}
                tone={latestPmc.tone}
                hint={latestPmc.status}
              />
            </StatGrid>
          )}

          <div className="card">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={pmcSeries} margin={CHART_MARGIN}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--color-text-muted)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--color-text-muted)" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="ctl" name="Fitness (CTL 42d)" stroke="var(--color-accent)" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="atl" name="Fatigue (ATL 7d)" stroke="var(--zone-4)" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="tsb" name="Form (TSB)" stroke="var(--status-success)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 'var(--text-xs)' }}>
              Teal = Chronic Training Load (Fitness) · Orange = Acute Fatigue · Green Dotted = Training Stress Balance (Form)
            </p>
          </div>

          <ScienceNote title="The Banister Impulse-Response Model">
            Fitness (CTL) takes ~6 weeks to build and decays slowly; Fatigue (ATL) spikes immediately and dissipates in ~7 days. 
            <strong> Training Stress Balance (TSB = CTL − ATL)</strong> reveals your physiological readiness: 
            negative values (−10 to −30) represent productive progressive overload; positive values (+5 to +20) represent peak race form.
          </ScienceNote>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Acute:Chronic Workload Ratio (ACWR) & Periodization Safety        */}
      {/* ---------------------------------------------------------------- */}
      {acwrSeries.length > 2 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 'var(--text-lg)' }}>Workload Ratio (ACWR) & Periodization</h3>
            <span className="muted">Gabbett Sweet Spot (0.80–1.30) & Foster Monotony</span>
          </div>

          {latestAcwr && (
            <StatGrid min={110}>
              <StatTile
                label="ACWR"
                value={latestAcwr.ratio}
                unit="ATL/CTL"
                tone={latestAcwr.tone}
                hint={latestAcwr.label}
              />
              <StatTile
                label="7-Day Monotony"
                value={monotonyStats ? monotonyStats.monotony : '—'}
                tone={monotonyStats?.tone ?? 'neutral'}
                hint={monotonyStats ? monotonyStats.label : 'Daily load variance'}
              />
              <StatTile
                label="Weekly Strain"
                value={monotonyStats ? monotonyStats.strain.toLocaleString() : '—'}
                hint="Load × Monotony"
              />
            </StatGrid>
          )}

          <div className="card">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={acwrSeries} margin={CHART_MARGIN}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--color-text-muted)" tick={{ fontSize: 11 }} />
                <YAxis
                  stroke="var(--color-text-muted)"
                  tick={{ fontSize: 11 }}
                  domain={[0, (dataMax) => Math.max(2.0, Math.ceil(dataMax * 1.2 * 10) / 10)]}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <ReferenceArea
                  y1={0.8}
                  y2={1.3}
                  fill="rgba(52, 211, 153, 0.12)"
                  stroke="rgba(52, 211, 153, 0.3)"
                  strokeDasharray="2 2"
                />
                <ReferenceLine
                  y={1.5}
                  stroke="var(--status-error)"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  label={{ value: 'Danger (1.50)', fill: 'var(--status-error)', fontSize: 10, position: 'insideTopRight' }}
                />
                <Line
                  type="monotone"
                  dataKey="acwr"
                  name="ACWR Ratio"
                  stroke="var(--color-accent)"
                  strokeWidth={2.5}
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 'var(--text-xs)' }}>
              Green Shaded Band = Sweet Spot (0.80–1.30) · Red Dashed Line = Danger Zone (&gt;1.50)
            </p>
          </div>

          <ScienceNote title="Gabbett ACWR & Foster Monotony Frameworks">
            Dr. Tim Gabbett’s <strong>Acute:Chronic Workload Ratio</strong> compares short-term fatigue (ATL) against long-term prepared fitness (CTL). 
            Staying in the <strong>0.80–1.30 Sweet Spot</strong> delivers maximum adaptation with minimum soft-tissue injury risk. 
            Dr. Carl Foster’s <strong>Training Monotony Index</strong> guards against overtraining: doing identical daily rides produces high monotony (&gt;2.0), 
            which degrades immune function and adaptation even at moderate weekly volumes.
          </ScienceNote>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* HRV Autonomic Baseline & Smallest Worthwhile Change (SWC) Bands    */}
      {/* ---------------------------------------------------------------- */}
      {hrvBands.length > 2 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 'var(--text-lg)' }}>Autonomic HRV & SWC Bands</h3>
            <span className="muted">Plews et al. 7-Day Rolling ln(rMSSD) Normal Range</span>
          </div>

          <div className="card">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={hrvBands} margin={CHART_MARGIN}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--color-text-muted)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--color-text-muted)" tick={{ fontSize: 11 }} domain={['dataMin - 10', 'dataMax + 10']} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="upperBand" name="Upper SWC Band" stroke="rgba(52, 211, 153, 0.4)" strokeDasharray="2 2" dot={false} />
                <Line type="monotone" dataKey="lowerBand" name="Lower SWC Band" stroke="rgba(248, 113, 113, 0.4)" strokeDasharray="2 2" dot={false} />
                <Line type="monotone" dataKey="baselineHrv" name="7-Day Baseline" stroke="var(--color-text-muted)" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="hrv" name="Daily HRV (ms)" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <ScienceNote title="Autonomic Nervous System Regulation">
            Raw daily HRV bounces with hydration and digestion. Sports scientists use a 7-day rolling mean bounded by the 
            <strong> Smallest Worthwhile Change (±0.5 × SD)</strong>. When daily HRV drops below the red band alongside elevated resting HR, 
            sympathetic stress dominates — your body is requesting a recovery day.
          </ScienceNote>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Substrate Oxidation (FatMax vs Carb Utilization)                  */}
      {/* ---------------------------------------------------------------- */}
      {substrateTotals.totalKcal > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Flame size={20} color="var(--zone-4)" />
            <h3 style={{ fontSize: 'var(--text-lg)' }}>Metabolic Substrate Utilization</h3>
          </div>

          <StatGrid min={140}>
            <StatTile label="Estimated Fat Burned" value={`${substrateTotals.fatGrams}g`} hint={`~${substrateTotals.fatPounds} lbs fat oxidized`} />
            <StatTile label="Carbs Oxidized" value={`${substrateTotals.carbGrams}g`} hint="Glycogen energy consumed" />
            <StatTile label="Total Energy" value={substrateTotals.totalKcal.toLocaleString()} unit="kcal" />
          </StatGrid>

          <ScienceNote title="FatMax & Aerobic Metabolism">
            In Zone 2 (60–70% max HR), fat oxidation peaks (FatMax), sparing glycogen and building mitochondrial enzyme density. 
            As intensity enters Zone 4 and 5, your muscles shift almost exclusively to carbohydrate glycolysis.
          </ScienceNote>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Headline: aerobic efficiency                                      */}
      {/* ---------------------------------------------------------------- */}
      {efficiencySeries.length > 1 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 'var(--text-lg)' }}>Heartbeats per mile</h3>
            <span className="muted">on {surfaceLabel} · your most-ridden surface</span>
          </div>

          {efficiencyTrend && (
            <StatGrid min={150}>
              <StatTile label="First" value={efficiencyTrend.first} unit="beats/mi" />
              <StatTile
                label="Latest"
                value={efficiencyTrend.last}
                unit="beats/mi"
                tone={efficiencyTrend.improved ? 'good' : 'bad'}
                hint={`${efficiencyTrend.change > 0 ? '+' : ''}${efficiencyTrend.change} (${efficiencyTrend.pctChange}%)`}
              />
            </StatGrid>
          )}

          <div className="card">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={efficiencySeries} margin={CHART_MARGIN}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--color-text-muted)" tick={{ fontSize: 11 }} />
                <YAxis
                  stroke="var(--color-text-muted)"
                  tick={{ fontSize: 11 }}
                  domain={['dataMin - 20', 'dataMax + 20']}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="beatsPerMile"
                  name="Beats per mile"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <ScienceNote title="Why this is the number that matters">
            This is total heartbeats spent to cover a mile — average heart rate multiplied by
            duration, divided by distance. It is the closest thing to a fitness measurement you can
            get without a lab, because it accounts for both speed and cost. A downward line means
            your cardiovascular system is doing the same mechanical work for less physiological
            expense.
          </ScienceNote>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Same route, then vs now                                           */}
      {/* ---------------------------------------------------------------- */}
      {routeGains.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 'var(--text-lg)' }}>Same route, then vs. now</h3>

          {routeGains.map((r) => (
            <div key={r.route} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}>
                  {r.route}
                </strong>
                <span className="muted">{r.rides}× ridden</span>
              </div>
              <span className="muted">
                {formatShortDate(r.firstDate)} → {formatShortDate(r.latestDate)}
              </span>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 4 }}>
                {r.speed && (
                  <div>
                    <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                      Average speed
                    </div>
                    <div style={{ fontSize: 'var(--text-base)' }}>
                      {r.speed.first} →{' '}
                      <strong style={{ color: r.speed.improved ? 'var(--status-success)' : 'var(--color-text)' }}>
                        {r.speed.latest} mph
                      </strong>
                    </div>
                  </div>
                )}
                {r.beatsPerMile && (
                  <div>
                    <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                      Beats per mile
                    </div>
                    <div style={{ fontSize: 'var(--text-base)' }}>
                      {r.beatsPerMile.first} →{' '}
                      <strong
                        style={{
                          color: r.beatsPerMile.improved ? 'var(--status-success)' : 'var(--color-text)',
                        }}
                      >
                        {r.beatsPerMile.latest}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          <ScienceNote title="The comparison that actually controls for terrain">
            Same trail, same climbs, same distance — so anything that changed is you, not the
            course.
          </ScienceNote>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* RPE vs HR                                                         */}
      {/* ---------------------------------------------------------------- */}
      {rpeVsHr.length > 3 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 'var(--text-lg)' }}>Effort vs. heart rate</h3>
          <div className="card">
            <ResponsiveContainer width="100%" height={220}>
              <ScatterChart margin={{ top: 8, right: 12, left: -20, bottom: 8 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="rpe"
                  name="RPE"
                  domain={[1, 10]}
                  ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                  stroke="var(--color-text-muted)"
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="avgHr"
                  name="Avg HR"
                  domain={['dataMin - 10', 'dataMax + 10']}
                  stroke="var(--color-text-muted)"
                  tick={{ fontSize: 11 }}
                />
                <ZAxis range={[60, 60]} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter name="First half" data={firstHalf} fill="var(--color-text-muted)" />
                <Scatter name="Second half" data={secondHalf} fill="var(--color-accent)" />
              </ScatterChart>
            </ResponsiveContainer>
            <p className="muted" style={{ margin: '8px 0 0' }}>
              Grey = first half of the study · Teal = second half
            </p>
          </div>

          <ScienceNote title="What to look for">
            Each dot is one ride: how hard it felt (RPE) against what your heart actually did. As
            fitness improves, the teal dots should sit <em>below</em> the grey ones.
          </ScienceNote>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Weekly volume + load                                              */}
      {/* ---------------------------------------------------------------- */}
      {weeks.length > 1 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 'var(--text-lg)' }}>Weekly volume</h3>
          <div className="card">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart
                data={weeks.map((w) => ({ ...w, label: formatShortDate(w.week) }))}
                margin={CHART_MARGIN}
              >
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="var(--color-text-muted)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--color-text-muted)" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="distanceMi" name="Miles" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <h3 style={{ fontSize: 'var(--text-lg)' }}>Weekly load</h3>
          <div className="card">
            <ResponsiveContainer width="100%" height={190}>
              <LineChart
                data={weeks.map((w) => ({ ...w, label: formatShortDate(w.week) }))}
                margin={CHART_MARGIN}
              >
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="var(--color-text-muted)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--color-text-muted)" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="load"
                  name="Load"
                  stroke="var(--zone-4)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* HR zones reference                                                */}
      {/* ---------------------------------------------------------------- */}
      {zoneRanges.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 'var(--text-lg)' }}>Your heart rate zones</h3>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {zoneRanges.map((zone) => (
              <div key={zone.zone} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div
                  style={{
                    flexShrink: 0,
                    width: 4,
                    alignSelf: 'stretch',
                    borderRadius: 2,
                    background: zone.color,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <strong style={{ color: zone.color }}>
                      Z{zone.zone} {zone.label}
                    </strong>
                    <span className="muted">
                      {zone.lowBpm}–{zone.highBpm} bpm
                    </span>
                  </div>
                  <p className="muted" style={{ margin: '2px 0 0', lineHeight: 1.5 }}>
                    {zone.effect}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

