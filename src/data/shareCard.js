/**
 * The study as a square graphic, for Instagram.
 *
 * Drawn on a canvas rather than assembled from a screenshot: a screenshot of a
 * phone screen is the wrong aspect ratio, carries the app's navigation, and
 * looks like a screenshot. This produces a 1080 × 1080 PNG that reads as a
 * deliberate post.
 *
 * No dependencies and no network. It runs offline in a lay-by if that is where
 * the ride finished, which is the same reason the rest of this app avoids map
 * tiles and remote fonts.
 *
 * Every number is passed in already computed. This file formats and positions;
 * it never derives a figure of its own, so the card cannot claim something the
 * app does not also show.
 */

const SIZE = 1080

// The app's own palette, hard-coded because a canvas cannot read CSS variables.
const INK = '#e8eef6'
const MUTED = '#8fa3bd'
const ACCENT = '#22d3ee'
const BG_TOP = '#0b1a2b'
const BG_BOTTOM = '#060f1a'
const RULE = 'rgba(143, 163, 189, 0.28)'

// The app's own faces, named exactly as styles.css loads them. A canvas takes
// a CSS font string but does nothing to fetch one, so a mismatch here silently
// renders the card in a fallback and it stops looking like the app.
const FONT_DISPLAY = '"Barlow Condensed", "Arial Narrow", Impact, sans-serif'
const FONT_BODY = 'Inter, "Helvetica Neue", Arial, sans-serif'

/** Draw text and return the width, so callers can lay things out beside it. */
function text(ctx, str, x, y, { font, color, align = 'left', baseline = 'alphabetic' }) {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.fillText(str, x, y)
  return ctx.measureText(str).width
}

/**
 * Break a string into lines that fit a width.
 *
 * Split from the drawing so a caller can find out how tall a block will be
 * before deciding where to start it. Anything anchored to the bottom of the
 * card has to know its own height first — the footnote used to be drawn from a
 * fixed y and a second line ran straight through the rule above the footer.
 */
function wrapLines(ctx, str, maxWidth, font) {
  ctx.font = font
  const lines = []
  let line = ''

  for (const word of String(str).split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Draw wrapped text from a top edge, returning the y after the last line. */
function paragraph(ctx, str, x, y, maxWidth, lineHeight, opts) {
  const lines = wrapLines(ctx, str, maxWidth, opts.font)
  let cursor = y
  for (const line of lines) {
    text(ctx, line, x, cursor, opts)
    cursor += lineHeight
  }
  return cursor
}

/**
 * A stat, drawn as a big number over a small label.
 *
 * The unit sits beside the figure at body weight rather than display weight, so
 * "39.8" reads as the number and "mi" reads as its unit at a glance.
 *
 * The figure shrinks to fit its column rather than running past the frame. A
 * card is generated from whatever the ride happened to be, so the width is not
 * knowable in advance: "39.8" and "28h 40m" both land here, and the second one
 * at a fixed 128px overflowed the edge of the graphic.
 */
function stat(ctx, { value, unit, label }, x, y, maxWidth) {
  const unitFont = `44px ${FONT_BODY}`
  const unitGap = 12

  ctx.font = unitFont
  const unitWidth = unit ? ctx.measureText(unit).width + unitGap : 0

  let size = 128
  const MIN_SIZE = 72
  while (size > MIN_SIZE) {
    ctx.font = `${size}px ${FONT_DISPLAY}`
    if (ctx.measureText(value).width + unitWidth <= maxWidth) break
    size -= 4
  }

  const width = text(ctx, value, x, y, {
    font: `${size}px ${FONT_DISPLAY}`,
    color: INK,
  })
  if (unit) {
    text(ctx, unit, x + width + unitGap, y, { font: unitFont, color: MUTED })
  }
  text(ctx, label.toUpperCase(), x, y + 46, {
    font: `600 26px ${FONT_BODY}`,
    color: MUTED,
  })
}

/**
 * Render the card.
 *
 * `stats` is up to four {value, unit, label} entries. `headline` is the one
 * sentence the post is actually about; it is the only place any claim is made,
 * and the caller is responsible for it being one the data supports.
 */
export function drawShareCard({
  week,
  weeks,
  stats = [],
  headline,
  footnote,
  bikeName = 'Poseidon X Gen 3',
} = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')

  const gradient = ctx.createLinearGradient(0, 0, 0, SIZE)
  gradient.addColorStop(0, BG_TOP)
  gradient.addColorStop(1, BG_BOTTOM)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, SIZE, SIZE)

  // A hairline frame gives the post an edge against a white feed.
  ctx.strokeStyle = RULE
  ctx.lineWidth = 2
  ctx.strokeRect(40, 40, SIZE - 80, SIZE - 80)

  const margin = 96

  text(ctx, 'RIDE LAB', margin, 168, { font: `72px ${FONT_DISPLAY}`, color: ACCENT })
  text(ctx, `WEEK ${week} OF ${weeks}`, SIZE - margin, 168, {
    font: `600 30px ${FONT_BODY}`,
    color: MUTED,
    align: 'right',
  })

  ctx.beginPath()
  ctx.moveTo(margin, 208)
  ctx.lineTo(SIZE - margin, 208)
  ctx.strokeStyle = RULE
  ctx.stroke()

  // Headline first: the reason the post exists.
  const afterHeadline = paragraph(ctx, headline ?? '', margin, 300, SIZE - margin * 2, 74, {
    font: `64px ${FONT_DISPLAY}`,
    color: INK,
  })

  // Stats in a 2 × 2 grid, positioned from the headline so a long one pushes
  // them down rather than overlapping.
  const gridTop = Math.max(afterHeadline + 90, 560)
  const columnX = [margin, SIZE / 2 + 20]
  // Each column runs to the right edge of the content area; the left one stops
  // short of the right column so the two can never collide.
  const columnWidth = [SIZE / 2 + 20 - margin - 24, SIZE - margin - (SIZE / 2 + 20)]
  stats.slice(0, 4).forEach((s, i) => {
    stat(ctx, s, columnX[i % 2], gridTop + Math.floor(i / 2) * 190, columnWidth[i % 2])
  })

  // Anchored to the rule above the footer and grown upward, so a footnote that
  // wraps to two or three lines pushes its own top up instead of running
  // through the rule below it. Capped at three lines: past that it is a caption
  // rather than a card.
  if (footnote) {
    const lineHeight = 36
    const footLines = wrapLines(ctx, footnote, SIZE - margin * 2, `28px ${FONT_BODY}`).slice(0, 3)
    const lastBaseline = SIZE - 176
    const firstBaseline = lastBaseline - (footLines.length - 1) * lineHeight

    footLines.forEach((line, i) => {
      text(ctx, line, margin, firstBaseline + i * lineHeight, {
        font: `28px ${FONT_BODY}`,
        color: MUTED,
      })
    })
  }

  ctx.beginPath()
  ctx.moveTo(margin, SIZE - 128)
  ctx.lineTo(SIZE - margin, SIZE - 128)
  ctx.strokeStyle = RULE
  ctx.stroke()

  text(ctx, bikeName.toUpperCase(), margin, SIZE - 88, {
    font: `600 26px ${FONT_BODY}`,
    color: MUTED,
  })
  text(ctx, 'BENTONVILLE, AR', SIZE - margin, SIZE - 88, {
    font: `600 26px ${FONT_BODY}`,
    color: MUTED,
    align: 'right',
  })

  return canvas
}

/**
 * Render and hand the browser a PNG to save.
 *
 * Waits for webfonts first. Canvas draws with whatever is loaded at the moment
 * the call runs, so firing before Barlow Condensed has arrived produces a card
 * set in the fallback face — no error, just a graphic that does not look like
 * the app it came from.
 */
export async function downloadShareCard(options, filename = 'ride-lab-card.png') {
  try {
    await document.fonts?.ready
  } catch {
    /* older browser, or fonts already resolved — draw with what is there */
  }

  const canvas = drawShareCard(options)

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(false)
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      resolve(true)
    }, 'image/png')
  })
}
