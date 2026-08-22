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

import { toDateString } from './data/dates.js'

export const SETTINGS_STORAGE_KEY = 'ridelab_settings'

export const DEFAULT_SETTINGS = {
  riderName: '',
  bikeName: 'Poseidon X Gen 3',
  homeBase: 'Bentonville, AR',

  age: 30,
  // Measured max beats a formula every time; predictedMaxHr(age) is the
  // fallback offered in the UI when the rider hasn't tested one.
  maxHr: 190,
  restingHrTarget: 55,

  // The case study window. Defaults to 16 weeks from first launch.
  caseStudyStartDate: toDateString(),
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
}

function clamp(key, value) {
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

export const DIFFICULTIES = [
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'black', label: 'Black' },
  { value: 'double-black', label: 'Double black' },
]

/**
 * Bentonville staples, seeded on first run.
 *
 * Picking a route beats typing one on a phone with cold hands, and consistent
 * route names are what make per-route progress comparable over four months.
 */
export const SEED_ROUTES = [
  {
    name: 'Slaughter Pen Loop',
    area: 'Slaughter Pen',
    distance_mi: 8.5,
    elevation_ft: 550,
    surface: 'singletrack',
    difficulty: 'blue',
    notes: 'Classic first ride. Flowy, close to downtown, easy to bail early.',
  },
  {
    name: 'Coler Mountain Bike Preserve',
    area: 'Coler',
    distance_mi: 10,
    elevation_ft: 900,
    surface: 'singletrack',
    difficulty: 'blue',
    notes: 'Punchy climbs, great flow trails. Airship for a coffee stop.',
  },
  {
    name: 'Back 40',
    area: 'Bella Vista',
    distance_mi: 20,
    elevation_ft: 1800,
    surface: 'singletrack',
    difficulty: 'blue',
    notes: 'Long endurance loop. Bring food and water — it is a real day out.',
  },
  {
    name: 'Razorback Greenway',
    area: 'Bentonville',
    distance_mi: 15,
    elevation_ft: 400,
    surface: 'paved-trail',
    difficulty: 'green',
    notes: 'Paved and mellow. The best place to hold a steady zone 2 effort.',
  },
  {
    name: 'Blowing Springs',
    area: 'Bella Vista',
    distance_mi: 7,
    elevation_ft: 700,
    surface: 'singletrack',
    difficulty: 'blue',
    notes: 'Connects to the Back 40. Good short after-work lap.',
  },
  {
    name: 'Handcut Hollow',
    area: 'Bentonville',
    distance_mi: 12,
    elevation_ft: 1000,
    surface: 'singletrack',
    difficulty: 'black',
    notes: 'More technical. Save it for when the legs and skills are ready.',
  },
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
