/**
 * Lightweight, zero-dependency canvas confetti burst.
 * Fired on PRs, milestone achievements, and successful GPX imports.
 */
export function fireConfetti({ particleCount = 50, durationMs = 1200 } = {}) {
  if (typeof document === 'undefined') return

  const canvas = document.createElement('canvas')
  canvas.style.position = 'fixed'
  canvas.style.top = '0'
  canvas.style.left = '0'
  canvas.style.width = '100vw'
  canvas.style.height = '100vh'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '99999'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return
  }

  const width = (canvas.width = window.innerWidth)
  const height = (canvas.height = window.innerHeight)

  const colors = ['#22d3ee', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#38bdf8']
  const particles = []

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: width * (0.35 + Math.random() * 0.3),
      y: height * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.75) * 16,
      size: Math.random() * 7 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      rotation: Math.random() * Math.PI * 2,
      vRotation: (Math.random() - 0.5) * 0.25,
    })
  }

  const start = performance.now()

  function frame(now) {
    const elapsed = now - start
    const progress = elapsed / durationMs

    ctx.clearRect(0, 0, width, height)

    particles.forEach((p) => {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.4 // gravity
      p.rotation += p.vRotation
      p.alpha = Math.max(0, 1 - progress)

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rotation)
      ctx.globalAlpha = p.alpha
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      ctx.restore()
    })

    if (elapsed < durationMs) {
      requestAnimationFrame(frame)
    } else {
      canvas.remove()
    }
  }

  requestAnimationFrame(frame)
}
