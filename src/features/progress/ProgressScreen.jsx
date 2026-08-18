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
import {
  weeklyRollup,
  summarize,
  beatsPerMile,
  trendDelta,
  hrZoneRanges,
} from '../../data/metrics.js'
import { formatShortDate, formatDuration, studyWeek, toDateString, daysBetween } from '../../data/dates.js'
import { StatGrid, StatTile, ScienceNote, EmptyState } from '../../components/ui.jsx'

/**
 * The case study view.
 *
 * Everything else in the app records; this screen argues. Each chart is paired
 * with what it means physiologically, because the point of the project is not
 * that the numbers moved — it is showing someone else why they moved, and what
 * they would have to do to move their own.
 */

const CHART_MARGIN = { top: 4, right: 8, left: -20, bottom: 0 }

const tooltipStyle = {
  background: 'var(--color-surface-raised)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-text)',
}

export default function ProgressScreen({ rides, bodyComp, settings }) {
  const totals = useMemo(() => summarize(rides), [rides])
  const weeks = useMemo(() => weeklyRollup(rides), [rides])

  // Oldest-first, and only rides carrying the fields each chart needs.
  const chronological = useMemo(
    () => [...rides].sort((a, b) => a.ridden_at.localeCompare(b.ridden_at)),
    [rides],
  )

  const efficiencySeries = useMemo(
    () =>
      chronological
        .map((r) => {
          const bpm = beatsPerMile(r.avg_hr, r.duration_min, r.distance_mi)
          if (bpm == null) return null
          return {
            date: formatShortDate(r.ridden_at.slice(0, 10)),
            beatsPerMile: bpm,
            route: r.route_name || 'Ride',
          }
        })
        .filter(Boolean),
    [chronological],
  )

  const rpeVsHr = useMemo(
    () =>
      chronological
        .filter((r) => r.rpe != null && r.avg_hr != null)
        .map((r, index) => ({
          rpe: Number(r.rpe),
          avgHr: Number(r.avg_hr),
          // Ordinal index drives the colour split below, so later rides are
          // visually distinguishable from earlier ones at the same RPE.
          order: index,
          date: formatShortDate(r.ridden_at.slice(0, 10)),
        })),
    [chronological],
  )

  const efficiencyTrend = trendDelta(
    efficiencySeries.map((d) => d.beatsPerMile),
    { lowerIsBetter: true },
  )

  const studyStart = settings.caseStudyStartDate
  const daysIn = Math.max(0, daysBetween(studyStart, toDateString()))
  const currentWeek = Math.min(studyWeek(studyStart, toDateString()), settings.caseStudyWeeks)
  const progressPct = Math.min(100, Math.round((daysIn / (settings.caseStudyWeeks * 7)) * 100))

  const zoneRanges = hrZoneRanges(settings.maxHr)

  // Split the scatter in half so "first half vs second half" reads directly off
  // the chart — the single clearest way to show the adaptation.
  const midpoint = Math.floor(rpeVsHr.length / 2)
  const firstHalf = rpeVsHr.slice(0, midpoint)
  const secondHalf = rpeVsHr.slice(midpoint)

  if (rides.length === 0) {
    return (
      <div className="screen">
        <div className="screen-header">
          <h2>Progress</h2>
        </div>
        <EmptyState>
          Log a few rides and this page fills in: weekly volume, training load, and whether the same
          effort is costing you fewer heartbeats.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Progress</h2>
        <span className="muted">
          Week {currentWeek} of {settings.caseStudyWeeks}
        </span>
      </div>

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
      {/* Headline: aerobic efficiency                                      */}
      {/* ---------------------------------------------------------------- */}
      {efficiencySeries.length > 1 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 'var(--text-lg)' }}>Heartbeats per mile</h3>

          {efficiencyTrend && (
            <StatGrid min={150}>
              <StatTile label="First ride" value={efficiencyTrend.first} unit="beats/mi" />
              <StatTile
                label="Latest ride"
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
            expense: more blood per beat, more capillaries feeding the muscle, more mitochondria
            turning oxygen into usable energy. Terrain and wind add noise ride to ride, so read the
            trend across weeks, not any single point.
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
            fitness improves, the teal dots should sit <em>below</em> the grey ones — the same
            perceived effort now costs fewer beats per minute. If teal sits higher at the same RPE,
            that is usually fatigue, heat, dehydration, or under-recovery rather than lost fitness,
            and the journal entries for those days will normally say so.
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

          <h3 style={{ fontSize: 'var(--text-lg)' }}>Training load</h3>
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

          <ScienceNote title="Load, and why it should climb slowly">
            Training load is RPE × minutes — an hour at RPE 5 scores 300. It captures something raw
            mileage misses: a short hard ride and a long easy one can stress the body about equally.
            The usual guidance is to let weekly load rise gradually rather than in jumps, because
            connective tissue adapts far more slowly than the cardiovascular system does. Your heart
            and lungs will be ready for big weeks well before your knees and tendons are, and that
            gap is where most new riders get hurt.
          </ScienceNote>
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

          <ScienceNote title="The most common beginner mistake">
            Riding everything at a middling, moderately-hard pace. It feels productive and builds
            less than it should: too hard to accumulate real aerobic volume, too easy to drive
            top-end adaptation. Most endurance programmes put roughly 80% of time in zones 1–2 and
            the remaining 20% genuinely hard. Zone 2 in particular is where the slow structural
            adaptations happen — new capillaries, denser mitochondria, better fat metabolism — and
            it is the zone that most rewards patience. Calculated from a max HR of {settings.maxHr}{' '}
            bpm, which you can change in Settings.
          </ScienceNote>
        </section>
      )}

      {bodyComp.length > 1 && (
        <ScienceNote title="Reading the body composition data">
          Endurance training changes body composition more slowly and less dramatically than most
          people expect, and the scale is the least informative instrument you own — it cannot
          distinguish fat, muscle, glycogen, or water. Waist measurement and resting heart rate
          usually move first and mean more. Four months is enough to see a real trend; it is not
          enough to see a transformation, and any honest case study should say so.
        </ScienceNote>
      )}
    </div>
  )
}
