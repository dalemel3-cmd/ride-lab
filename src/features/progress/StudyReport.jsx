import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Printer } from 'lucide-react'
import { formatShortDate, formatDuration } from '../../data/dates.js'

/**
 * The case study as a document, laid out for paper.
 *
 * The Markdown export is for someone who wants the numbers to paste elsewhere.
 * This is for someone who wants to read the study — a sponsor, a coach, a
 * doctor — and it has to survive being printed or saved as a PDF without the
 * app's phone shell coming with it.
 *
 * Rendered through a portal to document.body rather than inside the screen.
 * Print rules that reach into a nested overlay end up fighting the layout that
 * contains it; a sibling of the app root can simply be shown while the app is
 * hidden, which is both simpler and harder to break.
 *
 * Every figure here is passed in from the Progress screen rather than
 * recomputed, so the report, the on-screen card and the Markdown export cannot
 * disagree about what the study found.
 */

function Section({ number, title, children }) {
  return (
    <section className="report-section">
      <h2 className="report-h2">
        <span className="report-num">{number}</span> {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, value, note }) {
  return (
    <div className="report-row">
      <span className="report-row-label">{label}</span>
      <span className="report-row-value">{value ?? '—'}</span>
      {note && <span className="report-row-note">{note}</span>}
    </div>
  )
}

export default function StudyReport({
  onClose,
  settings,
  currentWeek,
  totals,
  weeks,
  maturity,
  efficiencyTrend,
  surfaceLabel,
  polarizedAudit,
  latestPmc,
  latestAcwr,
  monotonyStats,
  latestBody,
  baselineBody,
  latestHrvBand,
  routeGains,
  substrateTotals,
}) {
  // Escape closes it. A full-screen overlay with no keyboard exit is a trap on
  // a laptop, where this is most likely to be read.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('report-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('report-open')
    }
  }, [onClose])

  const generated = new Date().toISOString().slice(0, 10)
  const provisional = (ready, needDays) =>
    ready ? null : `provisional — ${maturity.days}d of ${needDays}d history`

  const bodyDelta = (field, unit, digits = 1) => {
    const from = baselineBody?.[field]
    const to = latestBody?.[field]
    if (from == null || to == null) return null
    const change = Math.round((Number(to) - Number(from)) * 10 ** digits) / 10 ** digits
    return `${to}${unit} (${change > 0 ? '+' : ''}${change} from ${from}${unit})`
  }

  return createPortal(
    <div className="study-report" role="dialog" aria-label="Case study report">
      <div className="report-toolbar">
        <button className="btn btn-primary" onClick={() => window.print()}>
          <Printer size={16} aria-hidden="true" /> Print / Save as PDF
        </button>
        <button className="btn" onClick={onClose}>
          <X size={16} aria-hidden="true" /> Close
        </button>
      </div>

      <article className="report-page">
        <header className="report-header">
          <h1 className="report-title">Cycling Physiological Case Study</h1>
          <p className="report-sub">
            Week {currentWeek} of {settings.caseStudyWeeks} · {settings.bikeName ?? 'Poseidon X Gen 3'} ·
            Bentonville, Arkansas
          </p>
          <p className="report-meta">
            Generated {formatShortDate(generated)} · {maturity.days} day
            {maturity.days === 1 ? '' : 's'} of ride history · {totals.rides} ride
            {totals.rides === 1 ? '' : 's'}
          </p>
        </header>

        {/* Stated once, before any number, so nobody has to infer it from a
            figure that looks more certain than it is. */}
        {maturity.days < 42 && (
          <p className="report-callout">
            <strong>Data maturity.</strong> Several models below average training load over 28 to 42
            days and are still filling those windows. Figures marked <em>provisional</em> are
            reported for completeness and should not yet be read as findings.
          </p>
        )}

        <Section number="1" title="Volume and telemetry">
          <Row label="Rides logged" value={totals.rides} />
          <Row label="Total distance" value={`${totals.distanceMi} mi`} />
          <Row label="Time in the saddle" value={formatDuration(totals.durationMin)} note="moving time" />
          <Row label="Total climbing" value={`${totals.elevationFt.toLocaleString()} ft`} />
          <Row
            label="Average speed"
            value={totals.avgSpeed ? `${totals.avgSpeed.toFixed(1)} mph` : null}
          />
          <Row
            label="Estimated energy"
            value={substrateTotals?.totalKcal ? `${substrateTotals.totalKcal.toLocaleString()} kcal` : null}
            note={
              substrateTotals?.fatGrams
                ? `${substrateTotals.fatGrams} g fat / ${substrateTotals.carbGrams} g carbohydrate`
                : null
            }
          />
        </Section>

        <Section number="2" title="Aerobic efficiency — the headline measure">
          {efficiencyTrend ? (
            <>
              <Row
                label={`Cardiac cost, ${surfaceLabel || 'primary surface'}`}
                value={`${efficiencyTrend.last} beats/mi`}
                note={`from ${efficiencyTrend.first} at the first ride (${efficiencyTrend.pctChange}%)`}
              />
              <p className="report-note">
                Heartbeats spent to cover one mile: average heart rate × duration ÷ distance. It is
                the closest field substitute for efficiency factor, which requires a power meter.
                Rides are compared only against others on the same surface, because gravel and
                singletrack cost far more per mile than pavement at identical fitness.
                {totals.rides < 4 && ' With fewer than four rides on a surface this is an early read rather than a trend.'}
              </p>
            </>
          ) : (
            <p className="report-note">
              Not yet available. Requires two rides on the same surface with average heart rate,
              duration and distance recorded.
            </p>
          )}
        </Section>

        <Section number="3" title="Training intensity distribution">
          {polarizedAudit ? (
            <>
              <Row
                label="Low / moderate / high"
                value={`${polarizedAudit.lowPct}% / ${polarizedAudit.modPct}% / ${polarizedAudit.highPct}%`}
                note={`${maturity.ridesWithContinuousHr} of ${totals.rides} rides carry continuous heart rate`}
              />
              <Row label="Pattern" value={polarizedAudit.label} />
              <p className="report-note">{polarizedAudit.description}</p>
            </>
          ) : (
            <p className="report-note">
              Not yet available. Requires at least one ride recorded with continuous
              (per-second) heart rate rather than a ride average.
            </p>
          )}
        </Section>

        <Section number="4" title="Training load and recovery">
          {latestPmc ? (
            <>
              <Row
                label="Fitness (CTL, 42-day)"
                value={latestPmc.ctl}
                note={provisional(maturity.ctlReady, 42)}
              />
              <Row label="Fatigue (ATL, 7-day)" value={latestPmc.atl} />
              <Row
                label="Form (TSB)"
                value={latestPmc.tsb}
                note={maturity.ctlReady ? latestPmc.status : provisional(false, 42)}
              />
              <Row
                label="Acute:chronic ratio"
                value={latestAcwr?.ratio}
                note={
                  maturity.acwrReady
                    ? latestAcwr?.label
                    : `not yet interpretable — needs 28d, has ${maturity.days}d`
                }
              />
              <Row
                label="Training monotony"
                value={monotonyStats?.monotony}
                note={
                  monotonyStats
                    ? `strain ${monotonyStats.strain}${
                        maturity.monotonyReady ? '' : ` — ${provisional(false, 7)}`
                      }`
                    : null
                }
              />
            </>
          ) : (
            <p className="report-note">No load history yet.</p>
          )}

          <Row label="Resting heart rate" value={bodyDelta('resting_hr', ' bpm', 0)} />
          <Row
            label="HRV (rMSSD)"
            value={latestHrvBand ? `${latestHrvBand.hrv} ms` : null}
            note={
              latestHrvBand
                ? latestHrvBand.baselineEstablished
                  ? `${latestHrvBand.autonomicState} · baseline ${latestHrvBand.baselineHrv} ms, normal range ${latestHrvBand.lowerBand}–${latestHrvBand.upperBand} ms`
                  : `establishing baseline — ${latestHrvBand.samples} readings so far`
                : null
            }
          />
        </Section>

        <Section number="5" title="Body composition against baseline">
          {baselineBody ? (
            <>
              <Row label="Baseline set" value={formatShortDate(baselineBody.measured_at)} />
              <Row label="Weight" value={bodyDelta('weight_lbs', ' lb')} />
              <Row label="Body fat" value={bodyDelta('body_fat_pct', '%')} />
              <p className="report-note">
                Body fat is measured by bioimpedance, which is strongly influenced by hydration.
                Day-to-day movement is water rather than tissue; only multi-week averages carry
                meaning.
              </p>
            </>
          ) : (
            <p className="report-note">
              No baseline measurement has been marked, so body trends have no fixed reference point.
            </p>
          )}
        </Section>

        <Section number="6" title="Repeated-course comparison">
          {routeGains.length > 0 ? (
            routeGains.map((route) => (
              <div key={route.route} className="report-route">
                <h3 className="report-h3">
                  {route.route} <span className="report-row-note">ridden {route.rides}×</span>
                </h3>
                <Row
                  label="Cardiac cost"
                  value={
                    route.beatsPerMile
                      ? `${route.beatsPerMile.first} → ${route.beatsPerMile.latest} beats/mi`
                      : null
                  }
                />
                <Row
                  label="Average speed"
                  value={route.speed ? `${route.speed.first} → ${route.speed.latest} mph` : null}
                />
                <p className="report-row-note">
                  {formatShortDate(route.firstDate)} → {formatShortDate(route.latestDate)}
                </p>
              </div>
            ))
          ) : (
            <p className="report-note">
              No course has been ridden twice yet. Repeating one route holds distance, climbing and
              surface constant, so a change in speed or cardiac cost is adaptation rather than a
              different day out — the cleanest control this study can produce.
            </p>
          )}
        </Section>

        <Section number="7" title="Weekly volume">
          {weeks.length > 0 ? (
            <table className="report-table">
              <thead>
                <tr>
                  <th>Week of</th>
                  <th>Rides</th>
                  <th>Miles</th>
                  <th>Time</th>
                  <th>Climb</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.week}>
                    <td>{formatShortDate(w.week)}</td>
                    <td>{w.rides}</td>
                    <td>{w.distanceMi}</td>
                    <td>{formatDuration(w.durationMin)}</td>
                    <td>{w.elevationFt.toLocaleString()} ft</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="report-note">No rides logged yet.</p>
          )}
        </Section>

        <Section number="8" title="Method and sources">
          <p className="report-note">
            Heart-rate zones are percentages of maximum heart rate ({settings.maxHr} bpm).
            Duration is moving time throughout; stopped time is excluded. Training load uses
            Banister TRIMP where continuous heart rate exists and session RPE otherwise. Fitness
            and fatigue are exponentially weighted moving averages decayed by 2/(N+1), which is not
            numerically comparable to a CTL figure from TrainingPeaks or Strava.
          </p>
          <ul className="report-refs">
            <li>
              Banister, E. W. (1991). Modeling elite athletic performance. In <em>Physiological
              Testing of Elite Athletes</em>.
            </li>
            <li>
              Foster, C. (1998). Monitoring training in athletes with reference to overtraining
              syndrome. <em>Medicine &amp; Science in Sports &amp; Exercise</em>, 30(7), 1164–1168.
            </li>
            <li>
              Gabbett, T. J. (2016). The training—injury prevention paradox. <em>British Journal of
              Sports Medicine</em>, 50(5), 273–280.
            </li>
            <li>
              Plews, D. J., et al. (2013). Training adaptation and heart rate variability in elite
              endurance athletes. <em>Sports Medicine</em>, 43(9), 773–781.
            </li>
            <li>
              Seiler, S. (2010). What is best practice for training intensity and duration
              distribution in endurance athletes? <em>IJSPP</em>, 5(3), 276–291.
            </li>
            <li>
              Tanaka, H., Monahan, K. D. &amp; Seals, D. R. (2001). Age-predicted maximal heart rate
              revisited. <em>JACC</em>, 37(1), 153–156.
            </li>
            <li>
              Uth, N., Sørensen, H., Overgaard, K. &amp; Pedersen, P. K. (2004). Estimation of VO2max
              from the ratio between HRmax and HRrest. <em>Eur J Appl Physiol</em>, 91(1), 111–115.
            </li>
          </ul>
        </Section>

        <footer className="report-footer">
          Ride Lab · generated {generated} · figures computed from logged rides and synced
          measurements, not estimated.
        </footer>
      </article>
    </div>,
    document.body,
  )
}
