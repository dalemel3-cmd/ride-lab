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
  homeBase: '1105 SW Grand Blvd, Bentonville, AR',

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
    name: 'Razorback Greenway Direct Benchmark (Optimized)',
    area: 'Bentonville → Rogers Greenway',
    distance_mi: 12.0,
    elevation_ft: 220,
    surface: 'paved-trail',
    difficulty: 'green',
    destination: 'Mercy Trailhead, 2710 S Rife Medical Ln, Rogers, AR',
    notes: 'Optimized unbroken Zone 2 flow. Direct east on SW 8th cyclepath onto Greenway south through underpasses to Mercy/Railyard. Zero stoplights, pure steady cadence.',
    cues: [
      'Depart 1105 SW Grand Blvd north on SW Rainbow to SW 8th Street (0.5 mi)',
      'Ride East on SW 8th wide multi-use trail straight to 8th St Market / Razorback Greenway (1.2 mi)',
      'Hop onto Razorback Greenway South (Grade-separated paved trail with road underpasses)',
      'Cruise uninterrupted past Lake Bentonville and Promenade to Mercy Trailhead turnaround (6.0 mi)',
      'Return North on Greenway, exit at SW 8th trail back west to 1105 SW Grand Blvd (12.0 mi total)',
    ],
    track: [
      [36.357, -94.225, 0],
      [36.365, -94.215, 0],
      [36.355, -94.205, 0],
      [36.335, -94.195, 0],
      [36.315, -94.175, 0],
      [36.335, -94.195, 0],
      [36.355, -94.205, 0],
      [36.365, -94.215, 0],
      [36.357, -94.225, 0],
    ],
  },
  {
    name: 'Razorback Greenway (Zone 2 Baseline)',
    area: 'Bentonville South → Rogers',
    distance_mi: 14.5,
    elevation_ft: 380,
    surface: 'paved-trail',
    difficulty: 'green',
    destination: 'Mercy Trailhead, 2710 S Rife Medical Ln, Rogers, AR',
    notes: 'Door-to-door Zone 2 baseline. Head east from 1105 SW Grand Blvd to Razorback Greenway, cruise south to Mercy Trailhead and return. Flat, uninterrupted aerobic spin.',
    cues: [
      'Depart 1105 SW Grand Blvd heading east towards SW I Street (0.3 mi)',
      'Turn North on SW I St sidepath toward SW 8th St (0.6 mi)',
      'Turn East on SW 8th St sidepath and join the Razorback Greenway at 8th St Market (0.8 mi)',
      'Head South on the Razorback Greenway past Lake Bentonville (5.5 mi)',
      'Reach Mercy Trailhead turnaround point (7.25 mi)',
      'Spin back North on the Greenway and return via SW 8th/I St to 1105 SW Grand Blvd (14.5 mi total)',
    ],
    track: [
      [36.357, -94.225, 0],
      [36.358, -94.218, 0],
      [36.365, -94.212, 0],
      [36.351, -94.205, 0],
      [36.335, -94.195, 0],
      [36.315, -94.175, 0],
      [36.335, -94.195, 0],
      [36.351, -94.205, 0],
      [36.365, -94.212, 0],
      [36.357, -94.225, 0],
    ],
  },
  {
    name: 'Slaughter Pen Classic Loop',
    area: 'Slaughter Pen',
    distance_mi: 13.5,
    elevation_ft: 580,
    surface: 'singletrack',
    difficulty: 'blue',
    destination: 'Compton Gardens, 312 N Main St, Bentonville, AR',
    notes: 'North on Greenway from 1105 SW Grand past the Downtown Square to Compton Gardens. Enter All-American -> Seed Tick -> Angus Chute -> Medusa. Return on Greenway.',
    cues: [
      'Depart 1105 SW Grand Blvd east to join Razorback Greenway at SW 8th St (1.2 mi)',
      'Ride North on Greenway through Downtown Bentonville Square to Compton Gardens (2.3 mi)',
      'Drop into All-American Trailhead (singletrack start)',
      'Connect through Seed Tick, Angus Chute, and Master Pass flow trails (8.0 mi trail lap)',
      'Exit back onto Razorback Greenway at B-Man Trailhead and cruise South home to 1105 SW Grand (13.5 mi total)',
    ],
    track: [
      [36.357, -94.225, 0],
      [36.368, -94.210, 0],
      [36.377, -94.208, 0],
      [36.388, -94.205, 0],
      [36.395, -94.212, 0],
      [36.385, -94.220, 0],
      [36.377, -94.208, 0],
      [36.368, -94.210, 0],
      [36.357, -94.225, 0],
    ],
  },
  {
    name: 'Coler Mountain Bike Preserve',
    area: 'Coler',
    distance_mi: 11.5,
    elevation_ft: 880,
    surface: 'singletrack',
    difficulty: 'blue',
    destination: 'Coler Mountain Bike Preserve South Gateway, 11840 Peach Orchard Rd, Bentonville, AR',
    notes: 'From 1105 SW Grand Blvd, head north to SW 3rd St / Applegate Trail. Follow Applegate west directly into Coler South Grove. Climb Oscar\'s Loop to The Hub for VAM test.',
    cues: [
      'Depart 1105 SW Grand Blvd north toward SW 3rd Street (1.4 mi)',
      'Take Applegate Trail / 3rd St Bike Path straight west into Coler South Gateway (1.5 mi)',
      'Ride up Coler Grove trail past Airship Coffee to Oscar\'s Loop (1.0 mi)',
      'Climb Oscar\'s Loop to The Hub for high-intensity climbing & VAM test (4.5 mi loop)',
      'Descend Family Flow or Good Dog back to South Gateway and return via Applegate Trail (11.5 mi total)',
    ],
    track: [
      [36.357, -94.225, 0],
      [36.369, -94.225, 0],
      [36.373, -94.240, 0],
      [36.381, -94.242, 0],
      [36.389, -94.238, 0],
      [36.381, -94.242, 0],
      [36.373, -94.240, 0],
      [36.369, -94.225, 0],
      [36.357, -94.225, 0],
    ],
  },
  {
    name: 'Back 40 Endurance Loop',
    area: 'Bella Vista',
    distance_mi: 21.0,
    elevation_ft: 1850,
    surface: 'singletrack',
    difficulty: 'blue',
    destination: 'Blowing Springs Park, 700 Blowing Springs Rd, Bella Vista, AR',
    notes: 'Long endurance loop. Head north on Greenway to Blowing Springs connector into the Back 40 outer loop.',
    cues: [
      'Depart 1105 SW Grand Blvd north on Razorback Greenway to Bella Vista / Blowing Springs (7.5 mi)',
      'Enter Back 40 trailhead at Blowing Springs Park',
      'Follow the Back 40 main outer loop counter-clockwise (13.5 mi singletrack)',
      'Return south via Razorback Greenway to 1105 SW Grand Blvd',
    ],
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
