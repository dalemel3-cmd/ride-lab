import { useMemo } from 'react'
import { Repeat, TrendingDown, TrendingUp } from 'lucide-react'
import { routeProgress, beatsPerMile, avgSpeed } from '../../data/metrics.js'
import { formatShortDate, recordDate } from '../../data/dates.js'
import { EmptyState, ScienceNote } from '../../components/ui.jsx'
import SegmentsCard from './SegmentsCard.jsx'

/**
 * Repeated-course comparison — the cleanest evidence this study can produce.
 *
 * This screen used to be a trail library: a seeded catalogue of Bentonville
 * routes with difficulty ratings, turn cues and one-tap navigation. Strava does
 * all of that better, and the rider now plans there. What Strava does not do
 * for a four-month case study is hold one course still and ask what changed
 * about the rider.
 *
 * That is the whole remit here. Ride the same ground twice and distance,
 * climbing and surface stop being variables, so a change in speed or in
 * heartbeats per mile is adaptation rather than a different day out. Everything
 * on this screen serves that one comparison: the courses already repeated, the
 * ones a second ride would unlock, and the segments matched automatically out
 * of overlapping GPS tracks.
 */

/** A first-versus-latest row, coloured by whether the change is an improvement. */
function Delta({ label, first, latest, unit, lowerIsBetter }) {
  if (first == null || latest == null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--text-sm)' }}>
        <span className="muted">{label}</span>
        <span className="muted">not recorded on both rides</span>
      </div>
    )
  }

  const change = Math.round((latest - first) * 10) / 10
  const improved = lowerIsBetter ? change < 0 : change > 0
  const flat = change === 0
  const color = flat ? 'var(--color-text-muted)' : improved ? 'var(--status-success)' : 'var(--status-warn)'
  const Icon = change < 0 ? TrendingDown : TrendingUp

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 8,
        fontSize: 'var(--text-sm)',
        flexWrap: 'wrap',
      }}
    >
      <span className="muted">{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
        <span className="muted">
          {first} → {latest} {unit}
        </span>
        <span style={{ color, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          {!flat && <Icon size={13} aria-hidden="true" />}
          {flat ? 'no change' : `${change > 0 ? '+' : ''}${change}`}
        </span>
      </span>
    </div>
  )
}

export default function RepeatsScreen({ rides, settings }) {
  const repeated = useMemo(() => routeProgress(rides), [rides])

  // Courses ridden exactly once. Naming the specific ride that would unlock a
  // comparison is more useful than telling someone to "repeat a route" — it
  // turns an abstraction into a decision about Saturday.
  const candidates = useMemo(() => {
    const counts = new Map()
    for (const ride of rides) {
      if (!ride.route_name) continue
      const key = ride.route_name.trim().toLowerCase()
      if (!counts.has(key)) counts.set(key, [])
      counts.get(key).push(ride)
    }

    return [...counts.values()]
      .filter((group) => group.length === 1)
      .map(([ride]) => ({
        id: ride.id,
        name: ride.route_name,
        date: recordDate(ride),
        distanceMi: ride.distance_mi,
        surface: ride.surface,
        beatsPerMile: beatsPerMile(ride.avg_hr, ride.duration_min, ride.distance_mi),
        speed: avgSpeed(ride.distance_mi, ride.duration_min),
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  }, [rides])

  const unnamed = useMemo(() => rides.filter((r) => !r.route_name).length, [rides])

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Repeats</h2>
        <span className="muted" style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
          {repeated.length} {repeated.length === 1 ? 'course' : 'courses'}
        </span>
      </div>

      <ScienceNote title="Why the same ground twice">
        Every ride differs in distance, climbing, surface and weather, and all of those move speed
        and heart rate more than four months of training will. Riding one course repeatedly holds
        them still. What is left moving is you — so a fall in heartbeats per mile over the same
        ground is adaptation, measured rather than inferred. It is the closest thing to a
        controlled experiment available without a laboratory.
      </ScienceNote>

      {repeated.length === 0 ? (
        <EmptyState>
          No course ridden twice yet. Log a ride with the same route name as an earlier one and the
          comparison appears here — first ride against latest, speed and cardiac cost side by side.
        </EmptyState>
      ) : (
        repeated.map((route) => (
          <section
            key={route.route}
            className="card"
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Repeat size={16} color="var(--color-accent)" aria-hidden="true" />
                {route.route}
              </h3>
              <span className="muted" style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                {route.rides}× · {formatShortDate(route.firstDate)} → {formatShortDate(route.latestDate)}
              </span>
            </div>

            <Delta
              label="Cardiac cost"
              first={route.beatsPerMile?.first}
              latest={route.beatsPerMile?.latest}
              unit="beats/mi"
              lowerIsBetter
            />
            <Delta
              label="Average speed"
              first={route.speed?.first}
              latest={route.speed?.latest}
              unit="mph"
            />

            {/* Speed rising while cardiac cost falls is the unambiguous result:
                more ground covered for fewer beats. Either one alone can be
                explained away by how hard the rider felt like going that day. */}
            {route.beatsPerMile?.improved && route.speed?.improved && (
              <p
                style={{
                  margin: 0,
                  fontSize: 'var(--text-sm)',
                  color: 'var(--status-success)',
                  lineHeight: 1.45,
                }}
              >
                Faster and cheaper over identical ground — the clearest adaptation signal the study
                can produce.
              </p>
            )}
            {route.beatsPerMile?.improved === false && route.speed?.improved === false && (
              <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.45 }}>
                Slower and more expensive than the first attempt. One ride is not a trend — heat,
                sleep and accumulated fatigue all read this way.
              </p>
            )}
          </section>
        ))
      )}

      {candidates.length > 0 && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-base)' }}>Ride one of these again</h3>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
            Each of these has been ridden once. A second attempt turns it into a controlled
            comparison — no new equipment, no extra logging, just the same ground.
          </p>

          {candidates.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 8,
                paddingTop: 8,
                borderTop: '1px solid var(--color-border)',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', minWidth: 0, wordBreak: 'break-word' }}>
                {c.name}
              </span>
              <span className="muted" style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                {[
                  formatShortDate(c.date),
                  c.distanceMi != null && `${c.distanceMi} mi`,
                  c.beatsPerMile != null && `${c.beatsPerMile} beats/mi`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          ))}
        </section>
      )}

      {/* The matching is by name, so a ride logged without one can never take
          part. Saying so beats silently leaving it out of the comparison. */}
      {unnamed > 0 && (
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
          {unnamed} {unnamed === 1 ? 'ride has' : 'rides have'} no route name, so {unnamed === 1 ? 'it cannot' : 'they cannot'} be
          matched to a repeat. Naming a ride the same way each time is what makes this comparison
          possible.
        </p>
      )}

      {/* Automatic matching out of overlapping GPS tracks — the same question
          asked without relying on the rider naming anything consistently. */}
      <SegmentsCard rides={rides} maxHr={settings?.maxHr} />
    </div>
  )
}
