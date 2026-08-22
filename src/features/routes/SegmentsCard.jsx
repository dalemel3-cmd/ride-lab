import { useMemo, useState } from 'react'
import { Repeat, Trophy, ChevronDown, ChevronUp } from 'lucide-react'
import { findSegments, MIN_SEGMENT_MI } from '../../data/segments.js'
import { formatShortDate } from '../../data/dates.js'
import { METERS_TO_FEET } from '../../data/track.js'
import { ScienceNote, EmptyState } from '../../components/ui.jsx'
import RouteMap from '../rides/RouteMap.jsx'
import ElevationProfile from '../rides/ElevationProfile.jsx'

/**
 * Stretches of ground ridden more than once, matched by GPS.
 *
 * This is the strongest comparison in the app. Everywhere else, terrain is a
 * confounder held down by grouping or by a typed route name; here it is
 * eliminated, because every effort listed covers the same dirt. A faster time
 * or a lower heart rate on a segment is a change in the rider and nothing else.
 */
export default function SegmentsCard({ rides, maxHr }) {
  const [expanded, setExpanded] = useState(null)

  // Matching is O(rides²) over resampled tracks, so it must not run on every
  // render — only when the ride list actually changes.
  const segments = useMemo(() => findSegments(rides), [rides])

  const tracked = rides.filter((r) => Array.isArray(r.track) && r.track.length >= 2).length
  const anyClimb = segments.some((s) => (s.gradePercent ?? 0) >= 3)

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Repeat size={18} color="var(--color-accent)" aria-hidden="true" />
        <h3 style={{ fontSize: 'var(--text-base)', margin: 0 }}>Repeat segments</h3>
      </div>

      {segments.length === 0 ? (
        <EmptyState>
          {tracked < 2
            ? `Segments are found automatically once you have two rides with GPS tracks — you have ${tracked}. Record a ride or import a GPX file to get started.`
            : `Your ${tracked} tracked rides don't yet share ${MIN_SEGMENT_MI} miles of common ground. Ride one of them again and it will appear here.`}
        </EmptyState>
      ) : (
        <>
          {segments.map((segment) => {
            const isOpen = expanded === segment.id
            const improving = segment.timeChangeMin !== null && segment.timeChangeMin < 0
            // VAM only means something on ground that actually climbs. Below
            // about 3% it measures rolling terrain and a tailwind more than it
            // measures the rider.
            const isClimb = (segment.gradePercent ?? 0) >= 3 && segment.efforts.some((e) => e.vam != null)

            return (
              <div
                key={segment.id}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : segment.id)}
                  aria-expanded={isOpen}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    minHeight: 44,
                    width: '100%',
                    color: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600 }}>
                      {segment.distanceMi} mi · {segment.efforts.length} efforts
                      {segment.elevationGainM !== null && segment.elevationGainM > 0 && (
                        <> · {Math.round(segment.elevationGainM * METERS_TO_FEET)} ft</>
                      )}
                    </span>
                    <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                      {segment.efforts[0]?.routeName ?? 'Unnamed stretch'}
                      {segment.fastest?.durationMin != null && (
                        <> · best {segment.fastest.durationMin} min</>
                      )}
                    </span>
                  </span>
                  {isOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                </button>

                {/* Only claim a trend when there are two timed efforts to compare. */}
                {segment.timeChangeMin !== null && (
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: improving ? 'var(--status-success)' : 'var(--color-text-muted)',
                    }}
                  >
                    {improving
                      ? `${Math.abs(segment.timeChangeMin)} min faster than your first effort`
                      : `${segment.timeChangeMin} min vs your first effort`}
                    {segment.hrChange !== null && segment.hrChange < 0 && (
                      <>
                        {' '}
                        · {Math.abs(segment.hrChange)} bpm lower{' '}
                        {segment.hrChangeSource === 'segment' ? 'on this segment' : 'ride-average heart rate'}
                      </>
                    )}
                  </div>
                )}

                {isOpen && (
                  <>
                    <RouteMap track={segment.geometry} height={140} />
                    <ElevationProfile points={segment.geometry} maxHr={maxHr} />
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                      <thead>
                        <tr className="muted" style={{ fontSize: 'var(--text-xs)', textAlign: 'left' }}>
                          <th style={{ padding: '4px 0' }}>Date</th>
                          <th style={{ padding: '4px 0' }}>Time</th>
                          <th style={{ padding: '4px 0' }}>Speed</th>
                          <th style={{ padding: '4px 0' }}>HR</th>
                          {isClimb && <th style={{ padding: '4px 0' }}>VAM</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {segment.efforts.map((effort) => (
                          <tr key={effort.rideId} style={{ borderTop: '1px solid var(--color-border)' }}>
                            <td style={{ padding: '6px 0' }}>
                              {formatShortDate(effort.date)}
                              {effort.isFastest && (
                                <Trophy
                                  size={13}
                                  color="var(--status-warn)"
                                  style={{ marginLeft: 6, verticalAlign: 'middle' }}
                                  aria-label="Fastest effort"
                                />
                              )}
                            </td>
                            {/* An em dash, not a zero: an untimed effort is unknown, not instant. */}
                            <td style={{ padding: '6px 0' }}>
                              {effort.durationMin != null ? `${effort.durationMin} min` : '—'}
                            </td>
                            <td style={{ padding: '6px 0' }}>
                              {effort.speedMph != null ? `${effort.speedMph} mph` : '—'}
                            </td>
                            {/* A segment average when the track carries heart
                                rate; otherwise the ride's, marked with an
                                asterisk rather than passed off as the
                                segment's. */}
                            <td style={{ padding: '6px 0' }}>
                              {effort.avgHr != null ? (
                                `${effort.avgHr} bpm`
                              ) : effort.rideAvgHr != null ? (
                                <span className="muted" title="Whole-ride average — this ride has no per-point heart rate">
                                  {effort.rideAvgHr} bpm*
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            {isClimb && (
                              <td style={{ padding: '6px 0' }}>
                                {effort.vam != null ? `${effort.vam} m/h` : '—'}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            )
          })}

          <ScienceNote title="Why segments beat whole-ride averages">
            Comparing two whole rides compares two different days of terrain as much as two states
            of fitness. A segment removes that: every effort here covers the same ground, so a
            faster time or a lower heart rate can only come from the rider. This is the closest
            you can get to a controlled experiment without a lab, and it is the number worth
            quoting at the end of the sixteen weeks.
            <br />
            <br />
            Heart rate here is the segment's own average, taken from the points inside it. A
            figure marked with an asterisk is the whole ride's average instead — that ride was
            recorded before per-point heart rate was stored, or came from a file without it. The
            two are not interchangeable, which is why they are marked differently rather than
            blended.
            {anyClimb && (
              <>
                <br />
                <br />
                <strong>VAM</strong> is metres climbed per hour, shown only on segments steeper
                than 3%. On a sustained climb almost all your work goes into lifting rider and
                bike against gravity, so unlike speed it cannot be flattered by a tailwind or a
                fast descent. It rises with aerobic fitness and falls with weight — the two things
                this study is tracking. Recreational riders sit around 500–900 m/h.
              </>
            )}
          </ScienceNote>
        </>
      )}
    </section>
  )
}
