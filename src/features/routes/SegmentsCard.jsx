import { useMemo, useState } from 'react'
import { Repeat, Trophy, ChevronDown, ChevronUp } from 'lucide-react'
import { findSegments, MIN_SEGMENT_MI } from '../../data/segments.js'
import { formatShortDate } from '../../data/dates.js'
import { ScienceNote, EmptyState } from '../../components/ui.jsx'
import RouteMap from '../rides/RouteMap.jsx'

/**
 * Stretches of ground ridden more than once, matched by GPS.
 *
 * This is the strongest comparison in the app. Everywhere else, terrain is a
 * confounder held down by grouping or by a typed route name; here it is
 * eliminated, because every effort listed covers the same dirt. A faster time
 * or a lower heart rate on a segment is a change in the rider and nothing else.
 */
export default function SegmentsCard({ rides }) {
  const [expanded, setExpanded] = useState(null)

  // Matching is O(rides²) over resampled tracks, so it must not run on every
  // render — only when the ride list actually changes.
  const segments = useMemo(() => findSegments(rides), [rides])

  const tracked = rides.filter((r) => Array.isArray(r.track) && r.track.length >= 2).length

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
                      <> · {Math.abs(segment.hrChange)} bpm lower average heart rate</>
                    )}
                  </div>
                )}

                {isOpen && (
                  <>
                    <RouteMap track={segment.geometry} height={140} />
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                      <thead>
                        <tr className="muted" style={{ fontSize: 'var(--text-xs)', textAlign: 'left' }}>
                          <th style={{ padding: '4px 0' }}>Date</th>
                          <th style={{ padding: '4px 0' }}>Time</th>
                          <th style={{ padding: '4px 0' }}>Speed</th>
                          <th style={{ padding: '4px 0' }}>Ride HR</th>
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
                            <td style={{ padding: '6px 0' }}>
                              {effort.avgHr != null ? `${effort.avgHr} bpm` : '—'}
                            </td>
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
            One caveat kept deliberately visible: the heart rate shown is the{' '}
            <strong>whole ride's</strong> average, not the segment's. GPX heart-rate samples are
            not stored alongside the track, so a per-segment figure would be invented. Treat it as
            context for the effort, not a measurement of it.
          </ScienceNote>
        </>
      )}
    </section>
  )
}
