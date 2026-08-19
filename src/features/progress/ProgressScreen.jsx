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
  dailyReadiness,
  substrateOxidation,
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
        recentTsb: latestPmc?.tsb ?? 0,
      }),
    [latestBody, baselineBody, latestHrvBand, latestPmc],
  )

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

  function handleExportCaseStudy() {
    const lines = [
      `# 16-Week Cycling Physiological Case Study Report`,
      `**Generated:** ${new Date().toISOString().slice(0, 10)} | **Study Week:** ${currentWeek} of ${settings.caseStudyWeeks}`,
      ``,
      `## 1. Executive Summary & Telemetry`,
      `- **Total Rides:** ${totals.rides}`,
      `- **Total Distance:** ${totals.distanceMi} miles`,
      `- **Total Saddle Time:** ${formatDuration(totals.durationMin)}`,
      `- **Total Elevation Climbed:** ${totals.elevationFt.toLocaleString()} ft`,
      `- **Estimated Energy Burned:** ${substrateTotals.totalKcal.toLocaleString()} kcal (${substrateTotals.fatGrams}g Fat [~${substrateTotals.fatPounds} lbs] / ${substrateTotals.carbGrams}g Carbs)`,
      ``,
      `## 2. Aerobic Decoupling & Efficiency (${surfaceLabel || 'Primary Surface'})`,
      efficiencyTrend
        ? `- **Initial Efficiency:** ${efficiencyTrend.first} beats/mile\n- **Current Efficiency:** ${efficiencyTrend.last} beats/mile\n- **Net Adaptation:** ${efficiencyTrend.change} beats/mile (${efficiencyTrend.pctChange}% change)`
        : `- Insufficient single-surface rides recorded yet.`,
      ``,
      `## 3. Banister Performance Management & Autonomic State`,
      latestPmc
        ? `- **Fitness (CTL - 42d):** ${latestPmc.ctl}\n- **Fatigue (ATL - 7d):** ${latestPmc.atl}\n- **Form (TSB):** ${latestPmc.tsb} (${latestPmc.status})`
        : `- No load history available.`,
      latestBody
        ? `- **Current Resting HR:** ${latestBody.resting_hr ?? '—'} bpm\n- **Current HRV (rMSSD):** ${latestBody.hrv_ms ?? '—'} ms\n- **Autonomic Status:** ${latestHrvBand?.autonomicState ?? 'Normal'}`
        : ``,
      ``,
      `## 4. Repeated Route Progress (Identical Course Control)`,
      ...routeGains.map(
        (r) =>
          `### ${r.route} (${r.rides}x)\n- Dates: ${r.firstDate} → ${r.latestDate}\n- Speed: ${r.speed?.first ?? '—'} → ${r.speed?.latest ?? '—'} mph\n- Cardiac Cost: ${r.beatsPerMile?.first ?? '—'} → ${r.beatsPerMile?.latest ?? '—'} beats/mi`,
      ),
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

      {/* Cyber-Athletic Readiness & Recovery HUD */}
      <ReadinessDial readiness={readiness} />

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

