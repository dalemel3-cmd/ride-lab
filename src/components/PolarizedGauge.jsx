import { formatDuration } from '../data/dates.js'

/**
 * PolarizedGauge Component.
 *
 * Visualizes Dr. Stephen Seiler's 3-Domain Intensity Distribution:
 * - Low Intensity (Zone 1 + Zone 2 / <75% max HR)
 * - Moderate Intensity (Zone 3 / 75-85% max HR - "The Grey Zone")
 * - High Intensity (Zone 4 + Zone 5 / >85% max HR)
 */
export default function PolarizedGauge({
  audit,
  title = 'Polarized 80/20 Distribution Audit',
  subtitle = 'Dr. Stephen Seiler 3-Domain Intensity Model',
}) {
  if (!audit) return null

  const {
    lowPct,
    modPct,
    highPct,
    lowSeconds,
    modSeconds,
    highSeconds,
    label,
    tone,
    description,
  } = audit

  const badgeColor =
    tone === 'good'
      ? 'var(--status-success)'
      : tone === 'warn'
        ? 'var(--status-warn)'
        : tone === 'bad'
          ? 'var(--status-error)'
          : 'var(--color-text-muted)'

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <h4 style={{ fontSize: 'var(--text-base)', margin: 0 }}>{title}</h4>
          {subtitle && <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>{subtitle}</span>}
        </div>
        <span
          style={{
            background: `color-mix(in srgb, ${badgeColor} 15%, transparent)`,
            color: badgeColor,
            padding: '3px 10px',
            borderRadius: 999,
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            border: `1px solid color-mix(in srgb, ${badgeColor} 30%, transparent)`,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      </div>

      {/* Tri-color Segmented Progress Bar */}
      <div
        style={{
          display: 'flex',
          height: 18,
          borderRadius: 999,
          overflow: 'hidden',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--color-border)',
        }}
      >
        {lowPct > 0 && (
          <div
            style={{
              width: `${lowPct}%`,
              background: 'var(--status-success)',
              transition: 'width 0.4s ease',
            }}
            title={`Low Intensity (Z1+Z2): ${lowPct}% (${formatDuration(Math.round(lowSeconds / 60))})`}
          />
        )}
        {modPct > 0 && (
          <div
            style={{
              width: `${modPct}%`,
              background: 'var(--status-warn)',
              transition: 'width 0.4s ease',
            }}
            title={`Moderate Intensity (Z3): ${modPct}% (${formatDuration(Math.round(modSeconds / 60))})`}
          />
        )}
        {highPct > 0 && (
          <div
            style={{
              width: `${highPct}%`,
              background: 'var(--status-error)',
              transition: 'width 0.4s ease',
            }}
            title={`High Intensity (Z4+Z5): ${highPct}% (${formatDuration(Math.round(highSeconds / 60))})`}
          />
        )}
      </div>

      {/* 3-Domain Legend & Metric Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(52, 211, 153, 0.08)',
            border: '1px solid rgba(52, 211, 153, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-success)' }} />
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--status-success)' }}>
              Low (Z1+Z2)
            </span>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', color: 'var(--color-text)' }}>
            {lowPct}%
          </span>
          <span className="muted" style={{ fontSize: '10px' }}>
            {formatDuration(Math.round(lowSeconds / 60))}
          </span>
        </div>

        <div
          style={{
            padding: '8px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(251, 191, 36, 0.08)',
            border: '1px solid rgba(251, 191, 36, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-warn)' }} />
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--status-warn)' }}>
              Mod (Z3)
            </span>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', color: 'var(--color-text)' }}>
            {modPct}%
          </span>
          <span className="muted" style={{ fontSize: '10px' }}>
            {formatDuration(Math.round(modSeconds / 60))}
          </span>
        </div>

        <div
          style={{
            padding: '8px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(248, 113, 113, 0.08)',
            border: '1px solid rgba(248, 113, 113, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-error)' }} />
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--status-error)' }}>
              High (Z4+Z5)
            </span>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', color: 'var(--color-text)' }}>
            {highPct}%
          </span>
          <span className="muted" style={{ fontSize: '10px' }}>
            {formatDuration(Math.round(highSeconds / 60))}
          </span>
        </div>
      </div>

      {/* Description / Guidance */}
      <p className="muted" style={{ margin: 0, fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>
        {description}
      </p>
    </div>
  )
}
