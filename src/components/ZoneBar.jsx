import { formatDuration } from '../data/dates.js'

/**
 * Time-in-zone as a stacked bar.
 *
 * A ride's average heart rate hides its shape entirely — 145 bpm can be an hour
 * of steady Zone 2 or half an hour of Zone 1 spliced with half an hour of
 * Zone 4, and those do different things to a body. This shows which one
 * actually happened.
 */
export default function ZoneBar({ distribution, height = 10, showLegend = true }) {
  if (!Array.isArray(distribution) || distribution.length === 0) return null

  const present = distribution.filter((z) => z.seconds > 0)
  if (present.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          display: 'flex',
          height,
          borderRadius: 999,
          overflow: 'hidden',
          background: 'var(--color-surface-raised)',
        }}
        role="img"
        aria-label={present.map((z) => `Zone ${z.zone} ${z.percent}%`).join(', ')}
      >
        {present.map((z) => (
          <div
            key={z.zone}
            style={{ width: `${z.percent}%`, background: z.color }}
            title={`Zone ${z.zone} · ${z.label} · ${formatDuration(z.seconds / 60)}`}
          />
        ))}
      </div>

      {showLegend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 'var(--text-xs)' }}>
          {present.map((z) => (
            <span key={z.zone} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: z.color,
                  flexShrink: 0,
                }}
              />
              <span className="muted">
                Z{z.zone} {z.percent}%
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
