import { hrZone } from '../../data/metrics.js'
import { elevationOf, heartRateOf, METERS_TO_FEET } from '../../data/track.js'

/**
 * Elevation against distance, drawn as a filled SVG area.
 *
 * Same reasoning as RouteMap: no tiles, no API key, no network. The shape of a
 * climb is the part worth seeing, and it renders instantly from data already on
 * the device.
 *
 * Optionally shades the profile by heart-rate zone, which is where this stops
 * being decoration: it shows exactly where on a climb the effort actually went,
 * and whether the same climb costs fewer beats four months later.
 */
export default function ElevationProfile({ points, maxHr, zoneRanges, height = 120 }) {
  const usable = Array.isArray(points) ? points.filter((p) => elevationOf(p) !== null) : []

  // Two points make a line but not a profile, and a flat line tells the rider
  // nothing they cannot see from the elevation figure itself.
  if (usable.length < 3) return null

  const elevations = usable.map(elevationOf)
  const minEle = Math.min(...elevations)
  const maxEle = Math.max(...elevations)
  const span = maxEle - minEle

  // Under about 3 m of variation the profile is GPS noise magnified into a
  // mountain range. Better to render nothing than something misleading.
  if (span < 3) return null

  const W = 300
  const H = 100
  const PAD = 4

  const x = (i) => PAD + (i / (usable.length - 1)) * (W - PAD * 2)
  const y = (ele) => H - PAD - ((ele - minEle) / span) * (H - PAD * 2)

  const line = usable.map((p, i) => `${Math.round(x(i) * 10) / 10},${Math.round(y(elevationOf(p)) * 10) / 10}`)
  const area = `${PAD},${H} ${line.join(' ')} ${W - PAD},${H}`

  // Colour each step by the heart-rate zone it was ridden in, when known.
  const zoneColor = (hr) => {
    if (hr === null) return null
    if (zoneRanges || maxHr) {
      const z = hrZone(hr, zoneRanges || maxHr)
      return z?.color ?? null
    }
    return null
  }

  const hasHr = usable.some((p) => heartRateOf(p) !== null)

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: '100%',
          height,
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface-raised)',
        }}
        role="img"
        aria-label={`Elevation profile climbing ${Math.round(span * METERS_TO_FEET)} feet`}
      >
        <polygon points={area} fill="var(--color-accent)" opacity="0.15" />

        {hasHr
          ? // One short stroke per step, coloured by the zone it was ridden in.
            usable.slice(1).map((p, i) => {
              const color = zoneColor(heartRateOf(p))
              if (!color) return null
              return (
                <line
                  key={i}
                  x1={x(i)}
                  y1={y(elevationOf(usable[i]))}
                  x2={x(i + 1)}
                  y2={y(elevationOf(p))}
                  stroke={color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              )
            })
          : (
              <polyline
                points={line.join(' ')}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
      </svg>
      <figcaption
        className="muted"
        style={{ fontSize: 'var(--text-xs)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}
      >
        <span>{Math.round(minEle * METERS_TO_FEET)} ft</span>
        <span>{hasHr ? 'Shaded by heart-rate zone' : `${Math.round(span * METERS_TO_FEET)} ft of relief`}</span>
        <span>{Math.round(maxEle * METERS_TO_FEET)} ft</span>
      </figcaption>
    </figure>
  )
}
