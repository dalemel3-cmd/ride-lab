/**
 * Draws a GPS track as an SVG polyline.
 *
 * Deliberately no map tiles: tiles mean an API key, a network round-trip, and a
 * blank grey box exactly where this app is most used — offline, on a trail. The
 * shape of the route is the part worth seeing, and it renders instantly from
 * data already on the device.
 */
export default function RouteMap({ track, height = 180 }) {
  const points = Array.isArray(track) ? track.filter((p) => Array.isArray(p) && p.length >= 2) : []

  if (points.length < 2) return null

  const lats = points.map((p) => Number(p[0]))
  const lngs = points.map((p) => Number(p[1]))
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)

  const PAD = 6
  const W = 300
  const H = 160

  // A degree of longitude shrinks with latitude, so scale it by cos(lat) or the
  // route comes out stretched east-west.
  const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180
  const spanLat = Math.max(maxLat - minLat, 1e-6)
  const spanLng = Math.max((maxLng - minLng) * Math.cos(midLatRad), 1e-6)

  // Fit to the tighter axis so the aspect ratio stays true.
  const scale = Math.min((W - PAD * 2) / spanLng, (H - PAD * 2) / spanLat)
  const offsetX = (W - spanLng * scale) / 2
  const offsetY = (H - spanLat * scale) / 2

  const project = ([lat, lng]) => {
    const x = offsetX + (lng - minLng) * Math.cos(midLatRad) * scale
    // SVG y grows downward; latitude grows north, so flip it.
    const y = H - offsetY - (lat - minLat) * scale
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
  }

  const projected = points.map(project)
  const path = projected.map(([x, y]) => `${x},${y}`).join(' ')
  const [startX, startY] = projected[0]
  const [endX, endY] = projected[projected.length - 1]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{
        width: '100%',
        height,
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-surface-raised)',
      }}
      role="img"
      aria-label={`Route map with ${points.length} recorded points`}
    >
      <polyline
        points={path}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={startX} cy={startY} r="4" fill="var(--status-success)" />
      <circle cx={endX} cy={endY} r="4" fill="var(--status-error)" />
    </svg>
  )
}
