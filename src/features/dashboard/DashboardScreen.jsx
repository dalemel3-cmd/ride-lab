import { useMemo } from 'react'
import {
  Activity,
  Zap,
  Heart,
  TrendingUp,
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
} from '../../data/metrics.js'
import {
  formatShortDate,
  formatDuration,
  studyWeek,
  toDateString,
  daysBetween,
  recordDate,
} from '../../data/dates.js'
import { StatGrid, FormStatusBadge } from '../../components/ui.jsx'

export default function DashboardScreen({
  rides,
  bodyComp,
  settings,
  onNavigate,
}) {
  // Sort chronological oldest-first
  const sortedRides = useMemo(
    () => [...rides].sort((a, b) => a.ridden_at.localeCompare(b.ridden_at)),
    [rides],
  )
  const sortedBody = useMemo(
    () => [...bodyComp].sort((a, b) => a.measured_at.localeCompare(b.measured_at)),
    [bodyComp],
  )

  const latestRide = sortedRides[sortedRides.length - 1] ?? null
  const latestBody = sortedBody[sortedBody.length - 1] ?? null
  const baselineBody = useMemo(
    () => sortedBody.find((m) => m.is_baseline) ?? sortedBody[0] ?? null,
    [sortedBody],
  )

  // 1. Performance Management Chart (PMC: CTL, ATL, TSB)
  const pmcSeries = useMemo(
    () => performanceManagementChart(rides, { defaultMaxHr: settings.maxHr }),
    [rides, settings.maxHr],
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
        hrvBaseline:
          latestHrvBand?.baselineHrv ??
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
    [latestBody, baselineBody, latestHrvBand, latestPmc],
  )

  // 4. Headline Aerobic Efficiency (Beats per Mile)
  const bySurface = useMemo(() => efficiencyBySurface(rides), [rides])
  const primarySurface = bySurface[0] ?? null
  const efficiencyTrend = primarySurface?.trend ?? null

  // 5. Weekly Volume & Load this week
  const weeks = useMemo(() => weeklyRollup(rides), [rides])
  const currentWeekRollup = weeks[weeks.length - 1] ?? {
    distanceMi: 0,
    durationMin: 0,
    load: 0,
    rides: 0,
  }

  // Study Progress
  const studyStart = settings.caseStudyStartDate
  const daysIn = Math.max(0, daysBetween(studyStart, toDateString()))
  const currentWeekNumber = Math.min(
    studyWeek(studyStart, toDateString()),
    settings.caseStudyWeeks,
  )

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

      {/* METRIC 1: Hero Daily Readiness Dial & Training Prescription */}
      <div
        className={`card card-glass-glow ${glowClass}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          borderLeft: `4px solid ${readinessColor}`,
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={18} color={readinessColor} />
            <span
              style={{
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
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
            }}
          >
            {readiness ? readiness.label : 'Not enough data'}
          </span>
        </div>

        {readiness ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
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
                background: 'rgba(6, 15, 26, 0.6)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Zap size={18} color="var(--color-accent)" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>
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
          // No measured signal means no score. Saying so is more useful than a
          // confident number nothing supports.
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
            Readiness is calculated from your HRV and resting heart rate against your baseline,
            plus training balance from logged rides. Log a ride, or add a resting HR measurement
            in Body, and it will appear here.
          </p>
        )}
      </div>

      {/* 4 CORE ATHLETE TELEMETRY TILES */}
      <StatGrid min={140}>
        {/* METRIC 2: Training Stress Balance (TSB / Form) */}
        <div
          className="card"
          style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              Form (TSB)
            </span>
            {latestPmc && (
              <FormStatusBadge status={latestPmc.status.split('/')[0]} tone={latestPmc.tone} />
            )}
          </div>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-2xl)',
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
            {/* An em dash, not 0.0. A form balance of zero is a real state —
                fitness exactly matching fatigue — and showing it for an
                account with no rides claims a measurement that was never
                taken. */}
            {latestPmc ? (latestPmc.tsb > 0 ? `+${latestPmc.tsb}` : latestPmc.tsb) : '—'}
          </span>
          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            {latestPmc
              ? `Fitness ${latestPmc.ctl} · Fatigue ${latestPmc.atl}`
              : 'Log a ride to start building this'}
          </span>
        </div>

        {/* METRIC 3: Autonomic Balance (Resting HR & HRV) */}
        <div
          className="card"
          style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              Resting Heart Rate
            </span>
            <Heart size={14} color="var(--color-accent)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-2xl)',
                color: 'var(--color-text)',
              }}
            >
              {latestBody?.resting_hr ?? '—'}
            </span>
            <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
              bpm
            </span>
          </div>
          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            HRV: {latestBody?.hrv_ms != null ? `${latestBody.hrv_ms} ms` : '—'} (
            {latestHrvBand?.autonomicState ?? 'Normal'})
          </span>
        </div>

        {/* METRIC 4: Aerobic Efficiency (Cardiac Cost per Mile) */}
        <div
          className="card"
          style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              Cardiac Cost
            </span>
            <TrendingUp size={14} color="var(--status-success)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-2xl)',
                color: 'var(--color-text)',
              }}
            >
              {efficiencyTrend?.last ?? '—'}
            </span>
            <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
              beats/mi
            </span>
          </div>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: efficiencyTrend?.improved
                ? 'var(--status-success)'
                : 'var(--color-text-muted)',
            }}
          >
            {efficiencyTrend
              ? `${efficiencyTrend.change > 0 ? '+' : ''}${efficiencyTrend.change} (${efficiencyTrend.pctChange}%)`
              : 'On primary surface'}
          </span>
        </div>

        {/* METRIC 5: Weekly Volume & Training Load */}
        <div
          className="card"
          style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              This Week's Volume
            </span>
            <Bike size={14} color="var(--zone-4)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-2xl)',
                color: 'var(--color-text)',
              }}
            >
              {currentWeekRollup.distanceMi}
            </span>
            <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
              mi
            </span>
          </div>
          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            {formatDuration(currentWeekRollup.durationMin)} · Load {currentWeekRollup.load}
          </span>
        </div>
      </StatGrid>

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
