/**
 * Small shared building blocks.
 *
 * Kept in one file on purpose: each is a handful of lines, and one import beats
 * six. Anything that grows past ~60 lines should move to its own module.
 */

/** A labelled number, the basic unit of every summary row. */
export function StatTile({ label, value, unit, tone, hint }) {
  const color =
    tone === 'good'
      ? 'var(--status-success)'
      : tone === 'bad'
        ? 'var(--status-error)'
        : 'var(--color-text)'

  return (
    <div
      className="card"
      style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}
    >
      <span
        style={{
          color: 'var(--color-text-muted)',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </span>
      <span
        style={{
          color,
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-2xl)',
          lineHeight: 1.1,
        }}
      >
        {value ?? '—'}
        {unit && value != null && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            {' '}
            {unit}
          </span>
        )}
      </span>
      {hint && (
        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>{hint}</span>
      )}
    </div>
  )
}

/** Responsive grid of StatTiles. */
export function StatGrid({ children, min = 140 }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        gap: 10,
      }}
    >
      {children}
    </div>
  )
}

/**
 * The plain-language explanation that sits beside a chart.
 *
 * This is what separates a log from a case study: the number is meaningless to
 * a beginner until someone says what it means for their body.
 */
export function ScienceNote({ title, children }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        borderLeft: '3px solid var(--color-accent)',
        borderRadius: '0 var(--radius-md) var(--radius-md) 0',
        background: 'var(--color-surface-raised)',
      }}
    >
      {title && (
        <strong
          style={{
            display: 'block',
            marginBottom: 4,
            color: 'var(--color-accent)',
            fontSize: 'var(--text-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {title}
        </strong>
      )}
      <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
        {children}
      </span>
    </div>
  )
}

/**
 * 1–10 RPE picker as ten buttons rather than a range input.
 *
 * A native slider is fiddly with gloves and gives no feedback about what a
 * given number means; discrete targets are tappable and self-documenting.
 */
export const RPE_ANCHORS = {
  1: 'Very light — barely moving',
  2: 'Light — easy conversation',
  3: 'Light — comfortable',
  4: 'Moderate — can still talk',
  5: 'Moderate — breathing noticeably',
  6: 'Somewhat hard — short sentences',
  7: 'Hard — a few words at a time',
  8: 'Very hard — one word answers',
  9: 'Very hard — near maximal',
  10: 'Maximal — cannot sustain',
}

export function RpePicker({ value, onChange, id = 'rpe' }) {
  return (
    <div>
      <label htmlFor={id}>Effort (RPE)</label>
      <div
        id={id}
        role="radiogroup"
        aria-label="Rate of perceived exertion"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const active = Number(value) === n
          // Colour ramps green → red across the scale so effort reads visually.
          const zoneColor = `var(--zone-${Math.min(5, Math.ceil(n / 2))})`
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(active ? null : n)}
              style={{
                minHeight: 'var(--tap-target)',
                padding: 0,
                border: `1px solid ${active ? zoneColor : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-sm)',
                background: active ? zoneColor : 'var(--color-surface-raised)',
                color: active ? 'var(--navy-950)' : 'var(--color-text-muted)',
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-base)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {n}
            </button>
          )
        })}
      </div>
      <p className="muted" style={{ margin: '6px 0 0', minHeight: '1.2em' }}>
        {value ? RPE_ANCHORS[value] : 'How hard did that feel?'}
      </p>
    </div>
  )
}

/** 1–5 picker for mood / energy / soreness. */
export function ScalePicker({ label, value, onChange, lowLabel, highLabel, id }) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <div
        id={id}
        role="radiogroup"
        aria-label={label}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const active = Number(value) === n
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(active ? null : n)}
              style={{
                minHeight: 'var(--tap-target)',
                border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-sm)',
                background: active ? 'var(--color-accent)' : 'var(--color-surface-raised)',
                color: active ? 'var(--navy-950)' : 'var(--color-text-muted)',
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-lg)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {n}
            </button>
          )
        })}
      </div>
      {(lowLabel || highLabel) && (
        <div
          className="muted"
          style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}
        >
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      )}
    </div>
  )
}

export function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>
}
