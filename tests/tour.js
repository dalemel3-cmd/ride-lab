/**
 * Screenshot tour.
 *
 * Seeds a realistic eight weeks of riding, then captures each screen. Not a
 * test — a way to see the whole app at once, and to eyeball layout on a phone
 * without owning every device.
 *
 * node tests/tour.js
 */

import { chromium } from 'playwright'

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:4173'
const USER_ID = '00000000-0000-4000-8000-000000000001'

const ROUTES = [
  ['Slaughter Pen Loop', 'Slaughter Pen', 8.5, 550, 'singletrack', 'blue', 'Classic first ride. Flowy, close to downtown, easy to bail early.'],
  ['Coler Mountain Bike Preserve', 'Coler', 10, 900, 'singletrack', 'blue', 'Punchy climbs, great flow trails. Airship for a coffee stop.'],
  ['Back 40', 'Bella Vista', 20, 1800, 'singletrack', 'blue', 'Long endurance loop. Bring food and water — it is a real day out.'],
  ['Razorback Greenway', 'Bentonville', 15, 400, 'paved-trail', 'green', 'Paved and mellow. The best place to hold a steady zone 2 effort.'],
]

/**
 * Eight weeks of plausible progression: volume creeps up, and average heart
 * rate drifts down at a given RPE — which is exactly the adaptation the
 * Progress screen is built to surface.
 */
const RIDE_PLAN = [
  [56, 'Razorback Greenway', 8.2, 42, 180, 154, 4, 'paved-trail', 'First ride on the Poseidon. Everything is new.'],
  [54, 'Slaughter Pen Loop', 6.4, 48, 480, 162, 6, 'singletrack', 'Walked two climbs. Humbling.'],
  [49, 'Razorback Greenway', 12.1, 58, 260, 151, 4, 'paved-trail', 'Held an easy pace the whole way.'],
  [47, 'Slaughter Pen Loop', 8.5, 55, 550, 159, 6, 'singletrack', 'Cleared the climb I walked last week.'],
  [42, 'Coler Mountain Bike Preserve', 9.8, 68, 880, 161, 7, 'singletrack', 'Coler is no joke. Legs cooked by the end.'],
  [40, 'Razorback Greenway', 15.3, 68, 400, 148, 4, 'paved-trail', 'Zone 2 discipline. Boring on purpose.'],
  [35, 'Slaughter Pen Loop', 8.6, 46, 550, 152, 5, 'singletrack', 'Same loop, nine minutes faster than week two.'],
  [33, 'Coler Mountain Bike Preserve', 10.2, 64, 900, 156, 6, 'singletrack', 'Climbs are starting to feel repeatable.'],
  [28, 'Back 40', 18.4, 132, 1620, 149, 7, 'singletrack', 'Longest ride yet. Bonked at mile 15 — need to eat earlier.'],
  [26, 'Razorback Greenway', 16.8, 71, 420, 143, 4, 'paved-trail', 'Recovery spin. Felt genuinely easy.'],
  [21, 'Slaughter Pen Loop', 8.6, 43, 550, 147, 5, 'singletrack', 'Fastest lap so far and it did not feel hard.'],
  [19, 'Coler Mountain Bike Preserve', 10.4, 58, 900, 151, 6, 'singletrack', 'Flow trails are clicking.'],
  [14, 'Back 40', 20.1, 128, 1800, 145, 7, 'singletrack', 'Ate every 40 minutes. No bonk. Huge difference.'],
  [12, 'Razorback Greenway', 18.2, 74, 440, 139, 4, 'paved-trail', 'Same route as week one, 10 miles longer, lower HR.'],
  [7, 'Slaughter Pen Loop', 8.7, 40, 550, 144, 5, 'singletrack', 'Under 40 minutes next time.'],
  [5, 'Coler Mountain Bike Preserve', 11.2, 57, 920, 146, 6, 'singletrack', 'Cleaned the whole climb section.'],
  [2, 'Back 40', 21.3, 121, 1840, 142, 7, 'singletrack', 'Best day on the bike so far. Could have kept going.'],
]

const BODY_PLAN = [
  [56, 198.4, 24.6, 37.5, 41.0, 68, true, 'Baseline. Day one.'],
  [42, 196.1, 24.0, 37.0, 40.8, 66, false, ''],
  [28, 193.8, 23.1, 36.2, 40.5, 63, false, 'Clothes fitting differently.'],
  [14, 191.2, 22.3, 35.6, 40.2, 60, false, ''],
  [2, 189.5, 21.6, 35.0, 40.0, 58, false, 'Resting HR down 10 from baseline.'],
]

const JOURNAL_PLAN = [
  [54, 3, 2, 4, 6.5, 'Legs are wrecked. Everyone here is so much faster than me. Trying not to compare.'],
  [40, 4, 4, 2, 7.5, 'Starting to understand why people love zone 2. Time passes differently when you are not suffering.'],
  [28, 3, 2, 4, 6.0, 'Bonked hard on the Back 40. Learned that fueling is not optional past two hours.'],
  [14, 5, 5, 1, 8.0, 'Twenty miles felt like ten did in week one. That is the whole thing right there.'],
  [2, 5, 4, 2, 7.5, 'Best ride yet. The bike disappears underneath you when the fitness is there.'],
]

const daysAgoISO = (d) => new Date(Date.now() - d * 86400000).toISOString()
const daysAgoDate = (d) => daysAgoISO(d).slice(0, 10)
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const db = {
  routes: ROUTES.map(([name, area, distance_mi, elevation_ft, surface, difficulty, notes], i) => ({
    id: uuid(100 + i), user_id: USER_ID, name, area, distance_mi, elevation_ft, surface, difficulty, notes,
  })),
  rides: RIDE_PLAN.map(([ago, route_name, distance_mi, duration_min, elevation_ft, avg_hr, rpe, surface, notes], i) => ({
    id: uuid(200 + i), user_id: USER_ID, ridden_at: daysAgoISO(ago),
    route_name, distance_mi, duration_min, elevation_ft, avg_hr,
    max_hr: avg_hr + 22, rpe, surface, notes, track: null,
  })),
  body_comp: BODY_PLAN.map(([ago, weight_lbs, body_fat_pct, waist_in, hip_in, resting_hr, is_baseline, notes], i) => ({
    id: uuid(300 + i), user_id: USER_ID, measured_at: daysAgoDate(ago),
    weight_lbs, body_fat_pct, waist_in, hip_in, resting_hr, is_baseline, notes,
  })),
  journal_entries: JOURNAL_PLAN.map(([ago, mood, energy, soreness, sleep_hrs, body], i) => ({
    id: uuid(400 + i), user_id: USER_ID, entry_date: daysAgoDate(ago),
    ride_id: null, mood, energy, soreness, sleep_hrs, body,
  })),
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await context.newPage()

  await page.route('**/*.supabase.co/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.includes('/auth/v1/')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ access_token: 'stub', token_type: 'bearer', expires_in: 3600, refresh_token: 'stub', user: { id: USER_ID } }),
      })
    }
    const table = url.pathname.split('/rest/v1/')[1]?.split('?')[0]
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(table && table in db ? db[table] : []),
    })
  })

  await page.addInitScript(
    ([id, seed]) => {
      localStorage.setItem('ridelab_auth', JSON.stringify({
        access_token: 'stub', token_type: 'bearer',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'stub', user: { id },
      }))
      localStorage.setItem('ridelab_signed_in_before', '1')
      // Study start eight weeks back, so Progress shows a study in flight.
      localStorage.setItem('ridelab_settings', JSON.stringify({
        riderName: 'Dale', bikeName: 'Poseidon X Gen 3', homeBase: 'Bentonville, AR',
        age: 30, maxHr: 190, restingHrTarget: 55,
        caseStudyStartDate: seed, caseStudyWeeks: 16,
        distanceUnit: 'mi', defaultSurface: 'singletrack',
      }))
    },
    [USER_ID, daysAgoDate(56)],
  )

  const shots = [
    ['rides', 'Rides'],
    ['progress', 'Progress'],
    ['body', 'Body'],
    ['journal', 'Journal'],
    ['routes', 'Routes'],
  ]

  for (const [hash, label] of shots) {
    await page.goto(`${APP_URL}/#${hash}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `tests/tour-${hash}.png`, fullPage: true })
    console.log(`captured ${label}`)
  }

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
