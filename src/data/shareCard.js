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

/** Instagram's tallest feed slot. More room for a chart than a square. */
const TALL_W = 1080
const TALL_H = 1350

// The app's own palette, hard-coded because a canvas cannot read CSS variables.
const INK = '#e8eef6'
const MUTED = '#8fa3bd'
const ACCENT = '#22d3ee'
const BG_TOP = '#0b1a2b'
const BG_BOTTOM = '#060f1a'
const RULE = 'rgba(143, 163, 189, 0.28)'

/**
 * Intensity domains, in fixed order: easy, moderate, hard.
 *
 * Three, not the five zones the app shows on screen, for two reasons. The
 * study's actual claim is about the polarized 80/20 split, which is a
 * three-domain model — and nobody scrolling a feed knows what Zone 4 means,
 * while everybody knows what "hard" means.
 *
 * The five-zone ramp is also not safe to publish at this size. Run through
 * the palette validator against this surface, zone 4 (#fb923c) and zone 5
 * (#f87171) come out ΔE 10.6 apart in normal vision — below the floor of 15,
 * which means a reader with full colour vision cannot reliably tell those two
 * segments apart. These three were picked by validating candidates rather than
 * by eye: worst adjacent pair ΔE 22.7 normal, 16.3 under deuteranopia, all
 * three above 3:1 against the background.
 *
 * They sit brighter than the validator's preferred dark-mode lightness band.
 * That check guards against many small marks vibrating on a dark surface; this
 * is three large segments in a single bar, separated by gaps and directly
 * labelled, and at feed-thumbnail size brighter is the more legible trade.
 * Identity never rests on colour alone here regardless — every segment carries
 * its own name and percentage.
 */
const DOMAIN_COLORS = ['#22d3ee', '#fbbf24', '#fb7185']

// The app's own faces, named exactly as styles.css loads them. A canvas takes
// a CSS font string but does nothing to fetch one, so a mismatch here silently
// renders the card in a fallback and it stops looking like the app.
// Kept in step with --font-display / --font-body in styles.css. The card is
// generated offline as often as not, so the fallbacks have to name faces that
// actually exist on a phone rather than trailing off into a generic sans.
const FONT_DISPLAY =
  '"Barlow Condensed", Oswald, "Helvetica Neue Condensed", "Arial Narrow", Impact, sans-serif'
const FONT_BODY =
  'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

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

/** A rounded rectangle path. Canvas has roundRect, but not everywhere. */
function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/**
 * One horizontal bar split into ordered segments, each directly labelled.
 *
 * A 2px gap separates neighbours so the boundary is a real edge rather than two
 * colours meeting, and only the outer ends are rounded — a rounded join in the
 * middle of a continuous bar reads as two bars.
 *
 * Segments below a few percent get their label dropped rather than overlapping
 * their neighbour's; the legend underneath still names every one, so nothing
 * relies on colour to be identified.
 */
function segmentedBar(ctx, segments, x, y, width, height) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  if (!(total > 0)) return y

  const GAP = 2
  const radius = height / 2
  let cursor = x

  segments.forEach((segment, i) => {
    const raw = (segment.value / total) * width
    const isFirst = i === 0
    const isLast = i === segments.length - 1
    const w = Math.max(0, raw - (isLast ? 0 : GAP))
    if (w <= 0) return

    ctx.save()
    // Round only the outer ends of the whole bar.
    roundedRect(ctx, cursor, y, w, height, isFirst || isLast ? radius : 0)
    if (!isFirst && !isLast) {
      ctx.beginPath()
      ctx.rect(cursor, y, w, height)
    } else if (isFirst && !isLast) {
      ctx.beginPath()
      ctx.moveTo(cursor + radius, y)
      ctx.lineTo(cursor + w, y)
      ctx.lineTo(cursor + w, y + height)
      ctx.lineTo(cursor + radius, y + height)
      ctx.arcTo(cursor, y + height, cursor, y, radius)
      ctx.arcTo(cursor, y, cursor + radius, y, radius)
      ctx.closePath()
    } else if (isLast && !isFirst) {
      ctx.beginPath()
      ctx.moveTo(cursor, y)
      ctx.lineTo(cursor + w - radius, y)
      ctx.arcTo(cursor + w, y, cursor + w, y + height, radius)
      ctx.arcTo(cursor + w, y + height, cursor, y + height, radius)
      ctx.lineTo(cursor, y + height)
      ctx.closePath()
    }
    ctx.fillStyle = segment.color
    ctx.fill()
    ctx.restore()

    // Direct label, inside the segment, only where it fits.
    const pct = Math.round((segment.value / total) * 100)
    if (w > 74) {
      text(ctx, `${pct}%`, cursor + w / 2, y + height / 2 + 1, {
        font: `700 30px ${FONT_BODY}`,
        color: BG_BOTTOM,
        align: 'center',
        baseline: 'middle',
      })
    }

    cursor += raw
  })

  return y + height
}

/** Swatch + name + value, one row per segment. Identity without colour alone. */
function legend(ctx, segments, x, y, width) {
  const columnWidth = width / segments.length
  segments.forEach((segment, i) => {
    const cx = x + columnWidth * i
    ctx.fillStyle = segment.color
    roundedRect(ctx, cx, y - 14, 16, 16, 4)
    ctx.fill()
    text(ctx, segment.label.toUpperCase(), cx + 26, y, {
      font: `600 25px ${FONT_BODY}`,
      color: MUTED,
    })
    if (segment.note) {
      text(ctx, segment.note, cx + 26, y + 30, { font: `25px ${FONT_BODY}`, color: MUTED })
    }
  })
  return y + (segments.some((s) => s.note) ? 40 : 10)
}

/**
 * A simple column chart, values labelled directly above each bar.
 *
 * No y-axis and no gridlines: with a handful of columns and a number on each,
 * an axis is furniture that competes with the data it is measuring.
 */
function columnChart(ctx, points, x, y, width, height, { color = ACCENT, unit = '' } = {}) {
  const max = Math.max(...points.map((p) => p.value), 0)
  if (!(max > 0)) return y + height

  // Room reserved above for the value and below for the category label. Without
  // this the tallest bar ran to the top of its box and the labels underneath
  // printed straight through whatever came next.
  const VALUE_SPACE = 40
  const LABEL_SPACE = 38
  const plotHeight = height - VALUE_SPACE - LABEL_SPACE
  const baseline = y + VALUE_SPACE + plotHeight

  // Capped, so two weeks render as columns rather than as two slabs filling the
  // card, and the group stays centred as the study grows past a dozen.
  const gap = 20
  const barWidth = Math.min(132, Math.max(10, (width - gap * (points.length - 1)) / points.length))
  const groupWidth = barWidth * points.length + gap * (points.length - 1)
  const startX = x + Math.max(0, (width - groupWidth) / 2)

  points.forEach((point, i) => {
    const bx = startX + i * (barWidth + gap)
    const h = Math.max(4, (plotHeight * point.value) / max)
    const by = baseline - h

    ctx.fillStyle = color
    // 4px rounded top, square where it meets the baseline it grows from.
    roundedRect(ctx, bx, by, barWidth, h, 4)
    ctx.fill()
    ctx.fillRect(bx, baseline - 6, barWidth, 6)

    text(ctx, `${point.value}${unit}`, bx + barWidth / 2, by - 12, {
      font: `700 27px ${FONT_BODY}`,
      color: INK,
      align: 'center',
    })
    text(ctx, point.label, bx + barWidth / 2, baseline + 30, {
      font: `600 24px ${FONT_BODY}`,
      color: MUTED,
      align: 'center',
    })
  })

  return y + height
}

/**
 * A row of stats sharing one type size.
 *
 * `stat` shrinks each figure independently to fit its column, which is right
 * for a 2 × 2 grid but wrong for a row: "63.4" stayed at full size next to a
 * shrunken "6h 23m", and the mismatch read as a hierarchy that is not there.
 * One size for the row, chosen as the largest that fits every column.
 */
function statRow(ctx, stats, x, y, width) {
  if (stats.length === 0) return y
  const columnWidth = width / stats.length
  const available = columnWidth - 24

  let size = 104
  const MIN = 56
  while (size > MIN) {
    const fits = stats.every((s) => {
      ctx.font = `44px ${FONT_BODY}`
      const unitWidth = s.unit ? ctx.measureText(s.unit).width + 12 : 0
      ctx.font = `${size}px ${FONT_DISPLAY}`
      return ctx.measureText(s.value).width + unitWidth <= available
    })
    if (fits) break
    size -= 4
  }

  stats.forEach((s, i) => {
    const cx = x + columnWidth * i
    const w = text(ctx, s.value, cx, y, { font: `${size}px ${FONT_DISPLAY}`, color: INK })
    if (s.unit) {
      text(ctx, s.unit, cx + w + 12, y, { font: `40px ${FONT_BODY}`, color: MUTED })
    }
    text(ctx, s.label.toUpperCase(), cx, y + 42, {
      font: `600 25px ${FONT_BODY}`,
      color: MUTED,
    })
  })

  return y + 42
}

/** A section heading with a thin rule under it. */
function sectionHeading(ctx, label, sub, x, y, width) {
  text(ctx, label.toUpperCase(), x, y, { font: `600 27px ${FONT_BODY}`, color: ACCENT })
  if (sub) {
    text(ctx, sub, x + width, y, {
      font: `25px ${FONT_BODY}`,
      color: MUTED,
      align: 'right',
    })
  }
  ctx.beginPath()
  ctx.moveTo(x, y + 18)
  ctx.lineTo(x + width, y + 18)
  ctx.strokeStyle = RULE
  ctx.lineWidth = 1
  ctx.stroke()
  return y + 18
}

/**
 * The tall card: the study's charts, not just its totals.
 *
 * The square card says what was done. This one shows the shape of it — where
 * the training actually sat and how the weeks are stacking up — which is what
 * makes it worth looking at rather than just reading.
 *
 * Every section is optional and simply absent when the data behind it is not
 * there yet, because a chart of two points pretending to be a trend is the one
 * thing this study cannot afford to publish.
 */
export function drawStudyCard({
  week,
  weeks,
  stats = [],
  domains = null,
  weekly = [],
  headline,
  footnote,
  bikeName = 'Poseidon X Gen 3',
} = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = TALL_W
  canvas.height = TALL_H
  const ctx = canvas.getContext('2d')

  const gradient = ctx.createLinearGradient(0, 0, 0, TALL_H)
  gradient.addColorStop(0, BG_TOP)
  gradient.addColorStop(1, BG_BOTTOM)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, TALL_W, TALL_H)

  ctx.strokeStyle = RULE
  ctx.lineWidth = 2
  ctx.strokeRect(40, 40, TALL_W - 80, TALL_H - 80)

  const margin = 88
  const contentWidth = TALL_W - margin * 2

  text(ctx, 'RIDE LAB', margin, 150, { font: `66px ${FONT_DISPLAY}`, color: ACCENT })
  text(ctx, `WEEK ${week} OF ${weeks}`, TALL_W - margin, 150, {
    font: `600 28px ${FONT_BODY}`,
    color: MUTED,
    align: 'right',
  })

  ctx.beginPath()
  ctx.moveTo(margin, 184)
  ctx.lineTo(TALL_W - margin, 184)
  ctx.strokeStyle = RULE
  ctx.lineWidth = 1
  ctx.stroke()

  let cursor = paragraph(ctx, headline ?? '', margin, 256, contentWidth, 62, {
    font: `54px ${FONT_DISPLAY}`,
    color: INK,
  })

  cursor = statRow(ctx, stats.slice(0, 3), margin, cursor + 96, contentWidth)

  if (domains) {
    cursor = sectionHeading(
      ctx,
      'Where the training sat',
      `${domains.minutes} min recorded`,
      margin,
      cursor + 76,
      contentWidth,
    )
    // The percentage rides in the legend as well as in the bar, because a thin
    // segment cannot hold a label — an 8% "hard" slice is too narrow for its
    // own number, and without this the reader could see 79 and 13 and never
    // learn the third value.
    const segments = [
      { label: 'Easy', value: domains.easyPct, color: DOMAIN_COLORS[0] },
      { label: 'Moderate', value: domains.modPct, color: DOMAIN_COLORS[1] },
      { label: 'Hard', value: domains.hardPct, color: DOMAIN_COLORS[2] },
    ]
      .filter((s) => s.value > 0)
      .map((s) => ({ ...s, note: `${s.value}%` }))

    cursor = segmentedBar(ctx, segments, margin, cursor + 34, contentWidth, 62)
    cursor = legend(ctx, segments, margin, cursor + 48, contentWidth)
  }

  // Only when there is room left below the intensity block. The footnote and
  // footer own the bottom 250px, and a chart that overruns them is worse than
  // no chart — the labels printed straight through the footnote.
  const weeklyHeight = 210
  const hasWeekly = weekly.length > 1 && cursor + 60 + weeklyHeight < TALL_H - 250
  if (hasWeekly) {
    cursor = sectionHeading(ctx, 'Miles per week', null, margin, cursor + 60, contentWidth)
    cursor = columnChart(ctx, weekly, margin, cursor + 20, contentWidth, weeklyHeight)
  }

  // In the opening week there is nothing to chart, and the card was two thirds
  // empty space. Saying what is being measured is honest — it makes a promise
  // rather than a claim — and it gives the graphic a reason to exist before the
  // data does.
  if (!domains && !hasWeekly) {
    cursor = sectionHeading(ctx, 'What is being measured', null, margin, cursor + 80, contentWidth)
    const promises = [
      ['Heartbeats per mile', 'whether the same ground costs less'],
      ['Speed at a fixed heart rate', 'the same effort, more ground covered'],
      ['Time in each intensity zone', 'where the training actually sits'],
      ['Resting heart rate and HRV', 'what the nights say about the days'],
    ]
    let row = cursor + 62
    for (const [title, why] of promises) {
      ctx.fillStyle = ACCENT
      roundedRect(ctx, margin, row - 20, 10, 10, 3)
      ctx.fill()
      text(ctx, title, margin + 28, row - 10, { font: `600 32px ${FONT_BODY}`, color: INK })
      text(ctx, why, margin + 28, row + 26, { font: `27px ${FONT_BODY}`, color: MUTED })
      row += 84
    }
    cursor = row
  }

  // Anchored to the footer rule and grown upward, so a footnote that wraps
  // pushes its own top up rather than running through the rule beneath it.
  if (footnote) {
    const lineHeight = 34
    const lines = wrapLines(ctx, footnote, contentWidth, `26px ${FONT_BODY}`).slice(0, 3)
    const lastBaseline = TALL_H - 168
    lines.forEach((line, i) => {
      text(ctx, line, margin, lastBaseline - (lines.length - 1 - i) * lineHeight, {
        font: `26px ${FONT_BODY}`,
        color: MUTED,
      })
    })
  }

  ctx.beginPath()
  ctx.moveTo(margin, TALL_H - 124)
  ctx.lineTo(TALL_W - margin, TALL_H - 124)
  ctx.strokeStyle = RULE
  ctx.lineWidth = 1
  ctx.stroke()

  text(ctx, bikeName.toUpperCase(), margin, TALL_H - 84, {
    font: `600 25px ${FONT_BODY}`,
    color: MUTED,
  })
  text(ctx, 'BENTONVILLE, AR', TALL_W - margin, TALL_H - 84, {
    font: `600 25px ${FONT_BODY}`,
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
  return downloadCanvas(drawShareCard, options, filename)
}

/** The tall data card. Same contract, different drawing. */
export async function downloadStudyCard(options, filename = 'ride-lab-study.png') {
  return downloadCanvas(drawStudyCard, options, filename)
}

async function downloadCanvas(draw, options, filename) {
  try {
    await document.fonts?.ready
  } catch {
    /* older browser, or fonts already resolved — draw with what is there */
  }

  const canvas = draw(options)

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
