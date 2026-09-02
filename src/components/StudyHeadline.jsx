/**
 * The answer, before the evidence.
 *
 * Progress opens onto a readiness dial, an intensity gauge, a progress bar and
 * eight charts, and the question the whole study exists to answer — is riding
 * changing this body, and how — is spread across all of them. This card states
 * it first, in the order a person actually cares about, and leaves the charts
 * as the working underneath.
 *
 * Every row carries its own honesty. A finding that does not have enough
 * history behind it is shown with what it is still waiting for, rather than
 * omitted (which hides that the study is running) or asserted flat (which is
 * how a week-one ACWR of 5.15 ends up reading as "Danger Zone").
 */

import { Confidence } from './ui.jsx'

const TONE_COLOR = {
  good: 'var(--status-success)',
  bad: 'var(--status-error)',
  warn: 'var(--status-warn)',
  neutral: 'var(--color-text)',
}

function Row({ item }) {
  const color = TONE_COLOR[item.tone] ?? 'var(--color-text)'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '10px 0',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            color: 'var(--color-text-muted)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            flex: '1 1 auto',
            minWidth: 0,
          }}
        >
          {item.label}
        </span>

        <span
          style={{
            color,
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-xl)',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
          }}
        >
          {item.value ?? '—'}
          {item.value != null && item.unit ? (
            <span
              style={{
                color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-sm)',
                marginLeft: 3,
              }}
            >
              {item.unit}
            </span>
          ) : null}
        </span>
      </div>

      <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.45 }}>
        {item.note}
      </span>

      {/* Stated on the row itself, not in a footnote: whoever reads the number
          is the person who needs to know it is not final. */}
      {item.pending && (
        <Confidence level="provisional">{item.pending}</Confidence>
      )}
    </div>
  )
}

export default function StudyHeadline({ title = 'Where the study stands', maturity, items = [] }) {
  const shown = items.filter(Boolean)
  if (shown.length === 0) return null

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-base)' }}>{title}</h3>
        {maturity && (
          <span className="muted" style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
            {maturity}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {shown.map((item) => (
          <Row key={item.key} item={item} />
        ))}
      </div>
    </section>
  )
}
