import { CheckCircle2, Circle } from 'lucide-react'
import { ScienceNote } from './ui.jsx'

/**
 * What the study can and cannot measure yet, and what each gap costs.
 *
 * Early on, most of this app is charts that cannot populate — not because
 * anything is broken, but because a four-month study genuinely has nothing to
 * say in week one. Blank panels read as bugs, and the rider has no way to tell
 * "not yet" from "wrong".
 *
 * So this names each prerequisite next to the specific analysis it unlocks.
 * The point is not a checklist for its own sake: it is that heart rate is worth
 * far more than another ride, and nothing in the app said so.
 */
export default function StudyReadiness({ items }) {
  const done = items.filter((i) => i.done).length
  if (done === items.length) return null

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ fontSize: 'var(--text-base)', margin: 0 }}>Study coverage</h3>
        <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
          {done} of {items.length} in place
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {item.done ? (
              <CheckCircle2
                size={16}
                color="var(--status-success)"
                aria-hidden="true"
                style={{ flexShrink: 0, marginTop: 2 }}
              />
            ) : (
              <Circle
                size={16}
                color="var(--color-text-muted)"
                aria-hidden="true"
                style={{ flexShrink: 0, marginTop: 2 }}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{item.label}</div>
              <div className="muted" style={{ fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>
                {item.done ? item.enables : item.blocks}
              </div>
            </div>
          </div>
        ))}
      </div>

      <ScienceNote title="Why this ordering">
        These are not equally valuable. Heart rate is the one that matters most: without it there
        is no way to separate <em>getting fitter</em> from <em>riding harder</em>, which is the
        entire question a physiological case study exists to answer. Distance and time record what
        you did; heart rate records what it cost you.
      </ScienceNote>
    </section>
  )
}
