import { useMemo } from 'react'
import {
  Activity,
  Zap,
  Heart,
  TrendingUp,
  TrendingDown,
  Plus,
  Bike,
} from 'lucide-react'
import {
  dailyReadiness,
  performanceManagementChart,
  hrvAutonomicBands,
  efficiencyBySurface,
  weeklyRollup,
  hrZoneRanges,
  acwr,
  weeklyMonotony,
  polarizedAudit,
  timeInZones,
  combineZoneTimes,
  resolveStudyStart,
  studyProgress,
  preTrainingHrv,
} from '../../data/metrics.js'
import {
  formatShortDate,
  formatDuration,
  toDateString,
  daysBetween,
  recordDate,
} from '../../data/dates.js'
import { FormStatusBadge, Confidence, toneColor } from '../../components/ui.jsx'
import PolarizedGauge from '../../components/PolarizedGauge.jsx'

export default function DashboardScreen({
  rides,
  bodyComp,
  settings,
  onNavigate,
}) {
  // Sort chronological oldest-first. Coerced through String() because a row
  // that reached this screen from the offline queue rather than the server may
  // not carry every column, and a bare `.localeCompare` on undefined takes the
  // whole screen down rather than dropping one ride.
  const sortedRides = useMemo(
    () => [...rides].sort((a, b) => String(a.ridden_at).localeCompare(String(b.ridden_at))),
    [rides],
  )
  const sortedBody = useMemo(
    () => [...bodyComp].sort((a, b) => String(a.measured_at).localeCompare(String(b.measured_at))),
    [bodyComp],
  )

  const latestRide = sortedRides[sortedRides.length - 1] ?? null
  const latestBody = sortedBody[sortedBody.length - 1] ?? null
  const baselineBody = useMemo(
    () => sortedBody.find((m) => m.is_baseline) ?? sortedBody[0] ?? null,
    [sortedBody],
  )
  // HRV needs a resting reference, which the baseline row is not guaranteed to
  // be — see preTrainingHrv.
  const hrvReference = useMemo(() => preTrainingHrv(sortedBody, rides), [sortedBody, rides])

  // The rider's own resting heart rate, for TRIMP's heart-rate reserve. Falls
  // back to 60 only when nothing has been measured.
  const restingHrForLoad = useMemo(() => {
    const measured = sortedBody.filter((m) => m?.resting_hr != null && Number(m.resting_hr) > 0)
    return measured.length > 0 ? Number(measured[measured.length - 1].resting_hr) : 60
  }, [sortedBody])

  // 1. Performance Management Chart (PMC: CTL, ATL, TSB)
  const pmcSeries = useMemo(
    () =>
      performanceManagementChart(rides, {
        defaultMaxHr: settings.maxHr,
        restingHr: restingHrForLoad,
      }),
    [rides, settings.maxHr, restingHrForLoad],
  )
  const latestPmc = pmcSeries[pmcSeries.length - 1] ?? null

  // 2. HRV Autonomic Baseline & SWC
  const hrvBands = useMemo(() => hrvAutonomicBands(bodyComp), [bodyComp])
  const latestHrvBand = hrvBands[hrvBands.length - 1] ?? null

  // 3. Autonomic Readiness Score (0-100)
  const readiness = useMemo(
    () =>
      dailyReadiness({
        hrv: latestBody?.hrv_ms != null ? Number(latestBody.hrv_ms) : null,
        // The rolling 7-day mean first, then the pre-training nights, and the
        // baseline row only as a last resort — that row's HRV can be a hard
        // ride's aftermath rather than a resting value.
        hrvBaseline:
          latestHrvBand?.baselineHrv ??
          hrvReference?.ms ??
          (baselineBody?.hrv_ms != null ? Number(baselineBody.hrv_ms) : null),
        restingHr:
          latestBody?.resting_hr != null ? Number(latestBody.resting_hr) : null,
        restingHrBaseline:
          baselineBody?.resting_hr != null
            ? Number(baselineBody.resting_hr)
            : null,
        // Null, not 0: with no rides there is no training balance to report,
        // and a zero here would manufacture a score out of nothing.
        recentTsb: latestPmc?.tsb ?? null,
      }),
    [latestBody, baselineBody, latestHrvBand, hrvReference, latestPmc],
  )

  // 4. Headline Aerobic Efficiency (Beats per Mile)
  const bySurface = useMemo(() => efficiencyBySurface(rides), [rides])
  const primarySurface = bySurface[0] ?? null
  const efficiencyTrend = primarySurface?.trend ?? null
  // Rides actually behind the trend: one surface, and only those that recorded
  // an average heart rate. Six logged rides can sit behind a three-ride line.
  const trendPoints = primarySurface?.points?.length ?? 0
  const surfaceLabel = (primarySurface?.surface ?? '').replace('-', ' ')

  // 5. Weekly Volume & Load this week
  const weeks = useMemo(() => weeklyRollup(rides), [rides])
  const currentWeekRollup = weeks[weeks.length - 1] ?? {
    distanceMi: 0,
    durationMin: 0,
    load: 0,
    rides: 0,
  }

  // 6. ACWR (Gabbett Workload Ratio)
  const currentAcwr = useMemo(
    () =>
      latestPmc?.atl != null && latestPmc?.acwrChronic != null
        ? acwr(latestPmc.atl, latestPmc.acwrChronic)
        : null,
    [latestPmc],
  )

  // 7. Foster Monotony & Strain (7-day rolling)
  const currentMonotony = useMemo(
    () => weeklyMonotony(rides, { defaultMaxHr: settings.maxHr, restingHr: restingHrForLoad }),
    [rides, settings.maxHr, restingHrForLoad],
  )

  // How much history the load models actually have.
  //
  // Same gate the Progress screen and the exported report use. Without it this
  // screen — the one the app opens on — announces "Danger Zone: spike in acute
  // fatigue exceeds chronic capacity" in the first fortnight, when the ratio is
  // really describing a denominator that is still mostly zeros.
  const maturity = useMemo(() => {
    const firstRide = sortedRides[0]
    const days = firstRide ? daysBetween(recordDate(firstRide), toDateString()) + 1 : 0
    return { days, ctlReady: days >= 42, acwrReady: days >= 28, monotonyReady: days >= 7 }
  }, [sortedRides])

  // 8. Polarized 80/20 Distribution (Recent rides with HR track)
  //
  // Sliced off `sortedRides`, not `rides`. The store hands rides back
  // newest-first, so `rides.slice(-10)` took the ten *oldest* — pinning this
  // card to the opening fortnight of the study permanently once the log passed
  // ten rides, while still calling itself "recent".
  const recentZones = useMemo(
    () => combineZoneTimes(sortedRides.slice(-10).map((r) => timeInZones(r.track, settings.maxHr))),
    [sortedRides, settings.maxHr],
  )
  const polarizedRecentAudit = useMemo(
    () => (recentZones ? polarizedAudit(recentZones) : null),
    [recentZones],
  )

  // Study Progress. The start date is the rider's if they set one, otherwise
  // derived from the baseline measurement rather than from the install date.
  const studyStart = useMemo(
    () => resolveStudyStart(settings.caseStudyStartDate, { rides, bodyComp }),
    [settings.caseStudyStartDate, rides, bodyComp],
  )
  const progress = useMemo(
    () => studyProgress(studyStart, settings.caseStudyWeeks),
    [studyStart, settings.caseStudyWeeks],
  )
  const daysIn = progress.day
  const currentWeekNumber = progress.week

  // Zone 2 Target Range. Derived from the rider's own max HR — no fallback
  // pair of numbers, which would be someone else's zone presented as theirs.
  const zones = hrZoneRanges(settings.maxHr)
  const zone2 = zones[1] ?? null

  // Readiness styling. Neutral until there is a real score to colour.
  const glowClass =
    readiness?.zone === 'green'
      ? 'glow-emerald'
      : readiness?.zone === 'amber'
        ? 'glow-amber'
        : readiness?.zone === 'red'
          ? 'glow-crimson'
          : ''
  const readinessColor =
    readiness?.zone === 'green'
      ? 'var(--status-success)'
      : readiness?.zone === 'amber'
        ? 'var(--status-warn)'
        : readiness?.zone === 'red'
          ? 'var(--status-error)'
          : 'var(--color-text-muted)'

  return (
    <div className="screen">
      {/* Header */}
      <div className="screen-header">
        <div>
          <h2>Athlete Cockpit</h2>
          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            Week {currentWeekNumber} of {settings.caseStudyWeeks} · Day {daysIn}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={() => onNavigate('rides')}
          >
            <Plus size={16} aria-hidden="true" /> Log Ride
          </button>
        </div>
      </div>

      {/* HERO ATHLETE COMMAND CENTER (Readiness + Directive + Matched Route + 1-Tap Nav) */}
      <div
        className={`card card-glass-glow ${glowClass}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          borderLeft: `4px solid ${readinessColor}`,
          position: 'relative',
          background: 'linear-gradient(135deg, rgba(18, 38, 60, 0.9) 0%, rgba(6, 15, 26, 0.85) 100%)',
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Activity size={18} color={readinessColor} style={{ flexShrink: 0 }} />
            <span
              style={{
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                whiteSpace: 'nowrap',
              }}
            >
              Daily Training Status
            </span>
          </div>
          <span
            style={{
              background: `color-mix(in srgb, ${readinessColor} 15%, transparent)`,
              color: readinessColor,
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              border: `1px solid color-mix(in srgb, ${readinessColor} 30%, transparent)`,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {readiness ? readiness.label : 'Not enough data'}
          </span>
        </div>

        {readiness ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-3xl)',
                  fontWeight: 700,
                  color: readinessColor,
                  lineHeight: 1,
                }}
              >
                {readiness.score}
              </span>
              <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                / 100 Readiness Score
                {readiness.inputs < 3 && (
                  <>
                    {' '}
                    · from {readiness.inputs} of 3 signals
                  </>
                )}
              </span>
            </div>

            {/* Dynamic Training Directive */}
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(6, 15, 26, 0.65)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                minWidth: 0,
              }}
            >
              <Zap size={18} color="var(--color-accent)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 'var(--text-xs)', lineHeight: 1.4, flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                <strong style={{ color: 'var(--color-text)' }}>Today's Target: </strong>
                {readiness.zone === 'green' && (
                  <span>
                    Full capacity. Prime for Zone 4/5 threshold climbing or high-volume endurance.
                  </span>
                )}
                {readiness.zone === 'amber' && (
                  <span>
                    Aerobic base focus.
                    {zone2
                      ? ` Ride Zone 2 (${zone2.lowBpm}–${zone2.highBpm} bpm) to build mitochondria without excess stress.`
                      : ' Ride Zone 2 to build mitochondria without excess stress.'}
                  </span>
                )}
                {readiness.zone === 'red' && (
                  <span>
                    Overreached autonomic state. Keep effort strictly in Zone 1 active recovery or take a rest day.
                  </span>
                )}
              </div>
            </div>

          </>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
            Readiness is calculated from your HRV and resting heart rate against your baseline,
            plus training balance from logged rides. Log a ride, or add a resting HR measurement
            in Body, and it will appear here.
          </p>
        )}
      </div>

      {/* 6 SPACIOUS, FULLY-LEGIBLE ATHLETE TELEMETRY TILES */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
          gap: 12,
        }}
      >
        {/* TILE 1: Training Stress Balance (TSB / Form) */}
        <div
          className="card"
          style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Form (TSB)
            </span>
            {latestPmc && (
              <FormStatusBadge
                status={
                  maturity.ctlReady ? latestPmc.status.split('/')[0] : `${maturity.days} of 42 days`
                }
                tone={maturity.ctlReady ? latestPmc.tone : 'neutral'}
              />
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-3xl)',
                lineHeight: 1,
                color:
                  latestPmc?.tone === 'good'
                    ? 'var(--status-success)'
                    : latestPmc?.tone === 'warn'
                      ? 'var(--status-warn)'
                      : latestPmc?.tone === 'bad'
                        ? 'var(--status-error)'
                        : 'var(--color-accent)',
              }}
            >
              {latestPmc ? (latestPmc.tsb > 0 ? `+${latestPmc.tsb}` : latestPmc.tsb) : '—'}
            </span>
          </div>
          {latestPmc && !maturity.ctlReady && (
            <Confidence level="provisional">
              Needs 42 days of history, has {maturity.days}d
            </Confidence>
          )}
          <span className="muted" style={{ fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>
            {latestPmc
              ? `Fitness ${latestPmc.ctl} · Fatigue ${latestPmc.atl}`
              : 'Log a ride to build Banister model'}
          </span>
        </div>

        {/* TILE 2: Autonomic Balance (Resting HR & HRV) */}
        <div
          className="card"
          style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Resting Heart Rate
            </span>
            <Heart size={15} color="var(--color-accent)" style={{ flexShrink: 0 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-3xl)',
                lineHeight: 1,
                color: 'var(--color-text)',
              }}
            >
              {latestBody?.resting_hr ?? '—'}
            </span>
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              bpm
            </span>
          </div>
          {latestHrvBand && !latestHrvBand.baselineEstablished && (
            <Confidence level="provisional">
              {latestHrvBand.samples} of 7 nightly readings
            </Confidence>
          )}
          <span className="muted" style={{ fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>
            HRV: {latestBody?.hrv_ms != null ? `${latestBody.hrv_ms} ms` : '—'} (
            {latestHrvBand?.autonomicState ?? 'Normal State'})
          </span>
        </div>

        {/* TILE 3: Aerobic Efficiency (Cardiac Cost per Mile) */}
        <div
          className="card"
          style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Cardiac Cost
            </span>
            {/* The arrow used to point up in success green whatever the trend
                did — so a cardiac cost climbing 40 beats a mile was decorated
                as good news. Falling is the improvement here, so the icon
                follows the direction the number actually moved. */}
            {efficiencyTrend ? (
              efficiencyTrend.improved ? (
                <TrendingDown size={15} color="var(--status-success)" style={{ flexShrink: 0 }} />
              ) : (
                <TrendingUp size={15} color="var(--status-warn)" style={{ flexShrink: 0 }} />
              )
            ) : (
              <TrendingUp size={15} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-3xl)',
                lineHeight: 1,
                color: 'var(--color-text)',
              }}
            >
              {efficiencyTrend?.last ?? '—'}
            </span>
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              beats/mi
            </span>
          </div>
          {efficiencyTrend && trendPoints < 3 && (
            <Confidence level="provisional">
              Early read ({trendPoints} of 3 rides on {surfaceLabel})
            </Confidence>
          )}
          <span
            style={{
              fontSize: 'var(--text-xs)',
              lineHeight: 1.4,
              color: efficiencyTrend?.improved
                ? 'var(--status-success)'
                : 'var(--color-text-muted)',
            }}
          >
            {/* The ride count is part of the claim, not a footnote. A −101
                beats/mile swing off three rides is a different statement from
                the same swing off thirty. */}
            {efficiencyTrend
              ? `${efficiencyTrend.change > 0 ? '+' : ''}${efficiencyTrend.change} (${efficiencyTrend.pctChange}%) across ${trendPoints} ${surfaceLabel} ride${trendPoints === 1 ? '' : 's'}`
              : 'Aerobic efficiency on primary surface'}
          </span>
        </div>

        {/* TILE 4: Weekly Volume & Training Load */}
        <div
          className="card"
          style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Week Volume
            </span>
            <Bike size={15} color="var(--zone-4)" style={{ flexShrink: 0 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-3xl)',
                lineHeight: 1,
                color: 'var(--color-text)',
              }}
            >
              {currentWeekRollup.distanceMi}
            </span>
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              mi
            </span>
          </div>
          <span className="muted" style={{ fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>
            {formatDuration(currentWeekRollup.durationMin)} · Load {currentWeekRollup.load}
          </span>
        </div>

        {/* TILE 5: ACWR (Gabbett Workload Safety) */}
        <div
          className="card"
          style={{
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minWidth: 0,
            borderLeft: `3px solid ${
              maturity.acwrReady
                ? toneColor(currentAcwr?.tone, 'var(--color-border)')
                : 'var(--color-border)'
            }`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              ACWR (Gabbett)
            </span>
            {currentAcwr && (
              <FormStatusBadge
                status={maturity.acwrReady ? currentAcwr.label : `${maturity.days} of 28 days`}
                tone={maturity.acwrReady ? currentAcwr.tone : 'neutral'}
              />
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-3xl)',
                lineHeight: 1,
                color: maturity.acwrReady ? toneColor(currentAcwr?.tone) : 'var(--color-text)',
              }}
            >
              {currentAcwr ? currentAcwr.ratio : '—'}
            </span>
            {/* 7-day acute over 28-day chronic — Gabbett's published windows.
                Not ATL/CTL: CTL is the 42-day fitness average, and using it as
                the denominator is exactly the mistake that reported an ACWR of
                5.15 in week one. */}
            <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
              7d / 28d
            </span>
          </div>
          {currentAcwr && !maturity.acwrReady && (
            <Confidence level="provisional">
              Needs 28 days of history, has {maturity.days}d
            </Confidence>
          )}
          <span className="muted" style={{ fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>
            {!currentAcwr
              ? 'Awaiting load history'
              : maturity.acwrReady
                ? currentAcwr.description
                : 'The chronic side of this ratio is a 28-day average that is still filling, so the number is arithmetic rather than a finding yet.'}
          </span>
        </div>

        {/* TILE 6: Foster Monotony & Strain */}
        <div
          className="card"
          style={{
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minWidth: 0,
            borderLeft: `3px solid ${
              maturity.monotonyReady
                ? toneColor(currentMonotony?.tone, 'var(--color-border)')
                : 'var(--color-border)'
            }`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Monotony & Strain
            </span>
            {currentMonotony && (
              <FormStatusBadge
                status={
                  maturity.monotonyReady ? currentMonotony.label : `${maturity.days} of 7 days`
                }
                tone={maturity.monotonyReady ? currentMonotony.tone : 'neutral'}
              />
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-3xl)',
                lineHeight: 1,
                color: maturity.monotonyReady ? toneColor(currentMonotony?.tone) : 'var(--color-text)',
              }}
            >
              {currentMonotony ? currentMonotony.monotony : '—'}
            </span>
            <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
              {currentMonotony ? `Strain ${currentMonotony.strain}` : ''}
            </span>
          </div>
          {currentMonotony && !maturity.monotonyReady && (
            <Confidence level="provisional">
              Needs 7 days of history, has {maturity.days}d
            </Confidence>
          )}
          <span className="muted" style={{ fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>
            {!currentMonotony
              ? '7-day load variance index'
              : maturity.monotonyReady
                ? currentMonotony.description
                : 'Needs a full week of days before the variance means anything.'}
          </span>
        </div>
      </div>

      {/* Polarized Training 80/20 Distribution Gauge */}
      {polarizedRecentAudit && (
        <PolarizedGauge
          audit={polarizedRecentAudit}
          title="Polarized 80/20 Intensity Audit"
          subtitle="Recent Rides with Continuous Heart Rate"
        />
      )}

      {/* QUICK STATUS & LAST RIDE INSIGHT */}
      {latestRide && (
        <div
          className="card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            borderLeft: '3px solid var(--color-accent)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <strong style={{ fontSize: 'var(--text-base)' }}>
              Latest Activity: {latestRide.route_name || 'Ride'}
            </strong>
            <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
              {formatShortDate(recordDate(latestRide))}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 'var(--text-sm)' }}>
            <span>
              Distance: <strong>{latestRide.distance_mi ?? '—'} mi</strong>
            </span>
            <span>
              Time: <strong>{formatDuration(latestRide.duration_min)}</strong>
            </span>
            <span>
              Avg HR: <strong>{latestRide.avg_hr ? `${latestRide.avg_hr} bpm` : '—'}</strong>
            </span>
            <span>
              RPE: <strong>{latestRide.rpe ? `${latestRide.rpe}/10` : '—'}</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
