/**
 * Date helpers anchored to a fixed timezone.
 *
 * Rides get logged from a phone that may be in another timezone on a trip. If
 * "today" were device-local, a ride logged in a different zone would land on the
 * wrong day and quietly skew the weekly rollups the whole case study rests on.
 * So every date in this app is resolved in one program timezone.
 */

export const PROGRAM_TIMEZONE = 'America/Chicago'

/** `YYYY-MM-DD` for a Date (or now), in the program timezone. */
export function toDateString(date = new Date()) {
  // en-CA formats as YYYY-MM-DD, which sorts lexicographically — handy, since
  // these strings are used as object keys and sort orders all over the app.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PROGRAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** `HH:MM` (24h) for a Date (or now), in the program timezone. */
export function toTimeString(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: PROGRAM_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

/**
 * Turn a wall-clock date + time the user typed into a real ISO instant.
 *
 * Naively doing `new Date('2026-05-01T07:30')` interprets the string in the
 * device's zone. This measures the program zone's actual offset on that date
 * (so it is DST-correct) and subtracts it.
 */
export function wallTimeToISO(dateStr, timeStr = '12:00') {
  const [h = '12', m = '00'] = String(timeStr).split(':')
  const naive = new Date(`${dateStr}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00Z`)
  if (Number.isNaN(naive.getTime())) return new Date().toISOString()

  // What does that UTC instant look like as a wall clock in the program zone?
  // The gap between the two is the offset we need to remove.
  const asProgramWallTime = new Date(
    naive.toLocaleString('en-US', { timeZone: PROGRAM_TIMEZONE }),
  )
  const asUtcWallTime = new Date(naive.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offsetMs = asProgramWallTime.getTime() - asUtcWallTime.getTime()

  return new Date(naive.getTime() - offsetMs).toISOString()
}

/** Monday-anchored `YYYY-MM-DD` for the week a date falls in. */
export function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateStr
  // getUTCDay: 0=Sun. Shift so Monday is the first day of the training week.
  const daysSinceMonday = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - daysSinceMonday)
  return d.toISOString().slice(0, 10)
}

/** Sunday-anchored `YYYY-MM-DD` ending the 7-day week that started on `startDateStr`. */
export function endOfWeek(startDateStr) {
  const d = new Date(`${startDateStr}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return startDateStr
  d.setUTCDate(d.getUTCDate() + 6)
  return d.toISOString().slice(0, 10)
}

/**
 * Human label for a full training week, e.g. "Aug 31 – Sep 6" or "May 4 – May 10".
 */
export function formatWeekRange(startDateStr) {
  if (!startDateStr) return ''
  const start = formatShortDate(startDateStr)
  const end = formatShortDate(endOfWeek(startDateStr))
  return `${start} – ${end}`
}

/** Whole days from `startStr` to `endStr` (negative if end precedes start). */
export function daysBetween(startStr, endStr) {
  const a = new Date(`${startStr}T12:00:00Z`).getTime()
  const b = new Date(`${endStr}T12:00:00Z`).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86400000)
}

/** 1-based study week for a date, given the study's start. */
export function studyWeek(startDateStr, dateStr) {
  const days = daysBetween(startDateStr, dateStr)
  if (days < 0) return 0
  return Math.floor(days / 7) + 1
}

/**
 * The calendar date a timestamped record belongs to, in the program timezone.
 *
 * Always use this instead of slicing the ISO string. `ridden_at.slice(0, 10)`
 * reads the UTC date, so a 7pm Central ride — stored as 00:00Z the next day —
 * displays one day later than the week it is grouped under and than the date
 * the edit form prefills. Evening rides are most rides, so the disagreement is
 * the common case rather than an edge case.
 */
export function recordDate(record, field = 'ridden_at') {
  const value = record?.[field]
  if (!value) return toDateString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? toDateString() : toDateString(parsed)
}

/** Short human label, e.g. "May 1". */
export function formatShortDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateStr
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(d)
}

/** "1h 24m" / "48m" from a minute count. */
export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** "1:24:07" from milliseconds — the live readout while recording. */
export function formatStopwatch(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
