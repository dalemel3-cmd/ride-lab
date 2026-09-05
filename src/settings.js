/**
 * App settings.
 *
 * One rule: no tunable value is hardcoded in a component. Max HR, the study
 * window, the rider's age — all of it lives here, so changing a threshold is a
 * one-line edit in one file rather than a hunt through screens.
 *
 * Stored settings are merged *over* the defaults, so a key added in a later
 * version appears automatically for someone with an older saved blob.
 */

export const SETTINGS_STORAGE_KEY = 'ridelab_settings'

export const DEFAULT_SETTINGS = {
  riderName: '',
  bikeName: 'Poseidon X Gen 3',
  // Town, not street address. A default is compiled into the JS bundle and
  // committed to the repository, so it is served to anyone who loads the app —
  // which is the wrong place for a home address in a project whose output is
  // published to Instagram. Anything more precise belongs in the field on the
  // Settings screen, where it stays on the rider's own device.
  homeBase: 'Bentonville, AR',

  age: 30,
  // Measured max beats a formula every time; predictedMaxHr(age) is the
  // fallback offered in the UI when the rider hasn't tested one.
  maxHr: 190,
  restingHrTarget: 55,

  // Lactate threshold heart rate, from a 20-minute field test.
  //
  // Null until tested, and null is a real answer rather than a missing one —
  // the app falls back to the best 20 minutes on record and labels the zones
  // provisional. See docs/THRESHOLD-TEST.md for the protocol, and zoneModel in
  // metrics.js for what changes once this is set.
  //
  // Threshold rather than max is the anchor because it is the number that can
  // actually be measured without a maximal effort, and the one that moves as
  // fitness improves.
  lthr: null,

  // The case study window.
  //
  // Null means "work it out from the data" — see resolveStudyStart in
  // metrics.js, which anchors to the baseline measurement. This used to default
  // to the day of first launch, which is not when any study starts: opening the
  // app four days before the first ride inflated every week number for sixteen
  // weeks and dated the study to before its first measurement. Setting a date
  // here in Settings still overrides it.
  caseStudyStartDate: null,
  caseStudyWeeks: 16,

  distanceUnit: 'mi',
  defaultSurface: 'singletrack',
}

/**
 * Clamps for every numeric setting.
 *
 * A typo'd max HR of 19 would silently put every ride in zone 5 and make the
 * whole zone analysis nonsense, so bounds are enforced on the way in rather
 * than trusted from the input element.
 */
export const NUMERIC_BOUNDS = {
  age: { min: 10, max: 100 },
  maxHr: { min: 120, max: 230 },
  restingHrTarget: { min: 30, max: 120 },
  caseStudyWeeks: { min: 1, max: 104 },
  lthr: { min: 90, max: 220 },
}

/**
 * Numeric settings where "not set" is a real answer, not a missing one.
 *
 * These have to be listed, because the clamp below cannot infer it: `Number(null)`
 * is 0, which is finite, so an untested threshold would sail through the guard
 * and come out clamped to the minimum — 90 bpm presented as a measured threshold,
 * which is worse than no threshold at all.
 */
export const NULLABLE_NUMERIC = new Set(['lthr'])

function clamp(key, value) {
  // Absent is not zero. Number('') and Number(null) are both 0, which is
  // finite, so an empty field used to sail past the guard below and get clamped
  // to the *minimum* — clearing Max HR silently set it to 120, which puts
  // essentially every ride in zone 5 and quietly invalidates every zone claim
  // in the study. Absent means the default, or null where null is meaningful.
  if (value === null || value === undefined || value === '') {
    return NULLABLE_NUMERIC.has(key) ? null : DEFAULT_SETTINGS[key]
  }
  const bounds = NUMERIC_BOUNDS[key]
  const num = Number(value)
  if (!Number.isFinite(num)) return DEFAULT_SETTINGS[key]
  if (!bounds) return num
  return Math.min(bounds.max, Math.max(bounds.min, num))
}

/** Merge over defaults and clamp every numeric field. */
export function normalizeSettings(raw) {
  const merged = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) }
  for (const key of Object.keys(NUMERIC_BOUNDS)) {
    merged[key] = clamp(key, merged[key])
  }
  return merged
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    return normalizeSettings(raw ? JSON.parse(raw) : {})
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings) {
  const normalized = normalizeSettings(settings)
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    /* private mode — settings stay in memory for this session */
  }
  return normalized
}

export const SURFACES = [
  { value: 'singletrack', label: 'Singletrack' },
  { value: 'gravel', label: 'Gravel' },
  { value: 'paved-trail', label: 'Paved trail' },
  { value: 'road', label: 'Road' },
]

export const ACWR_THRESHOLDS = {
  undertrainingMax: 0.8,
  sweetSpotMax: 1.3,
  cautionMax: 1.5,
}

export const FOSTER_MONOTONY_THRESHOLDS = {
  optimalMax: 1.5,
  moderateMax: 2.0,
}
