/**
 * End-to-end UI smoke test.
 *
 * Supabase is stubbed at the network layer, so this exercises the real app —
 * real routing, real store, real charts — without touching the live database or
 * needing an account. Auth is faked by seeding the session into localStorage.
 *
 * Setup:
 *   npm run build && npm run preview
 *   npm install --no-save playwright && npx playwright install chromium
 *   node tests/ui.js
 */

import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:4173'

let passed = 0
let failed = 0

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    console.log(`  ok   ${name} → ${JSON.stringify(actual)}`)
    passed += 1
  } else {
    console.error(`  FAIL ${name}`)
    console.error(`       expected: ${JSON.stringify(expected)}`)
    console.error(`       actual:   ${JSON.stringify(actual)}`)
    failed += 1
  }
}

// In-memory stand-in for the four tables, so writes made by the UI are readable
// back by the UI exactly as the real PostgREST would return them.
const db = { rides: [], body_comp: [], journal_entries: [], routes: [] }

// `context.setOffline` cannot simulate the offline case here: page.route
// intercepts requests before they reach the network stack, so the stub would
// keep answering happily. This flag makes the stub itself fail instead, which
// is what actually exercises the queue.
let offline = false

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  })
  // iPhone-ish viewport: this app is used on a phone, so it gets tested on one.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`  [browser error] ${msg.text()}`)
  })

  // ---- Stub Supabase -------------------------------------------------------
  await page.route('**/*.supabase.co/**', async (route) => {
    if (offline) return route.abort('internetdisconnected')

    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (url.pathname.includes('/auth/v1/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'stub',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'stub',
          user: { id: '00000000-0000-4000-8000-000000000001', email: 'rider@example.com' },
        }),
      })
    }

    const table = url.pathname.split('/rest/v1/')[1]?.split('?')[0]
    if (!table || !(table in db)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }

    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(db[table]),
      })
    }

    if (method === 'POST') {
      const rows = JSON.parse(request.postData() ?? '[]')
      const list = Array.isArray(rows) ? rows : [rows]
      for (const row of list) {
        const index = db[table].findIndex((r) => r.id === row.id)
        if (index >= 0) db[table][index] = { ...db[table][index], ...row }
        else db[table].push(row)
      }
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(list),
      })
    }

    if (method === 'DELETE') {
      const id = url.searchParams.get('id')?.replace('eq.', '')
      db[table] = db[table].filter((r) => r.id !== id)
      return route.fulfill({ status: 204, body: '' })
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  // ---- Fake a signed-in session -------------------------------------------
  await page.addInitScript(() => {
    const oneHourFromNow = Math.floor(Date.now() / 1000) + 3600
    localStorage.setItem(
      'ridelab_auth',
      JSON.stringify({
        access_token: 'stub',
        token_type: 'bearer',
        expires_at: oneHourFromNow,
        refresh_token: 'stub',
        user: { id: '00000000-0000-4000-8000-000000000001', email: 'rider@example.com' },
      }),
    )
    localStorage.setItem('ridelab_signed_in_before', '1')
  })

  console.log('\nApp shell')
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.bottom-nav', { timeout: 15000 })
  check('bottom nav has six destinations', await page.locator('.nav-item').count(), 6)
  // Headings are uppercased by CSS, so compare case-insensitively.
  check(
    'lands on the athlete cockpit',
    (await page.locator('h2').first().innerText()).toLowerCase(),
    'athlete cockpit',
  )

  // The route library should self-seed on an empty account.
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('ridelab_routes') ?? '[]').length > 0, {
    timeout: 10000,
  })
  const seeded = await page.evaluate(() => JSON.parse(localStorage.getItem('ridelab_routes')).length)
  check('seeds the Bentonville route library', seeded > 0, true)

  console.log('\nReadiness on an empty account')
  // No rides and no measurements means nothing to judge readiness from. This
  // used to render a fixed 77 / "Optimal Readiness" regardless — a number with
  // no data behind it, which is the one thing this app must never do.
  const cockpit = await page.locator('.card').first().innerText()
  check('no readiness score before any data exists', /100 Readiness Score/.test(cockpit), false)
  check('it says so instead', /not enough data/i.test(cockpit), true)

  console.log('\nTap targets')
  // Anything tappable must clear 44px — this app gets used with gloves on.
  const smallTargets = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((el) => el.offsetParent !== null && el.getBoundingClientRect().height < 44)
      .map((el) => el.textContent?.trim().slice(0, 20) || el.getAttribute('aria-label')),
  )
  check('every visible button is at least 44px tall', smallTargets, [])

  console.log('\nLogging a ride')
  // The app now opens on the dashboard rather than the ride log, so the Log
  // button is not on screen until Rides is selected.
  await page.locator('.nav-item', { hasText: 'Rides' }).click()
  await page.waitForSelector('article.card, .empty-state')
  await page.getByRole('button', { name: /Log/ }).click()
  await page.waitForSelector('#distance')

  await page.fill('#route', 'Slaughter Pen Classic Loop')
  await page.fill('#distance', '12.4')
  await page.fill('#duration', '58')
  await page.fill('#elevation', '640')
  await page.fill('#avg_hr', '148')
  await page.fill('#max_hr', '176')
  await page.getByRole('radio', { name: '6', exact: true }).click()

  const rpeHint = await page.locator('form p.muted').first().innerText()
  check('RPE 6 explains itself', rpeHint.includes('Somewhat hard'), true)

  await page.getByRole('button', { name: 'Save ride' }).click()
  await page.waitForSelector('article.card', { timeout: 10000 })

  check('the ride reaches the (stubbed) server', db.rides.length, 1)
  check('RPE is stored, not dropped', db.rides[0]?.rpe, 6)
  check('heart rate is stored', db.rides[0]?.avg_hr, 148)
  check('distance is stored as a number', db.rides[0]?.distance_mi, 12.4)

  const cardText = await page.locator('article.card').first().innerText()
  check('the card shows the route', cardText.includes('Slaughter Pen Classic Loop'), true)
  // 12.4 mi in 58 min = 12.8 mph.
  check('the card computes average speed', cardText.includes('12.8 mph'), true)
  // 6 × 58 = 348.
  check('the card computes training load', cardText.includes('348'), true)
  // 148 of 190 max = 78% → zone 3.
  check('the card classifies the HR zone', cardText.includes('Zone 3'), true)

  console.log('\nOffline write')
  // The whole point of the queue: a save with no network must still succeed.
  offline = true
  await page.getByRole('button', { name: /Log/ }).click()
  await page.waitForSelector('#distance')
  // Dated two weeks back, with a heart rate, so that once it syncs there are
  // two distinct training weeks and two HR-bearing rides — enough for the
  // weekly-volume and beats-per-mile charts to have something to draw.
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
  await page.fill('#date', twoWeeksAgo)
  await page.fill('#route', 'Coler')
  await page.fill('#distance', '8')
  await page.fill('#duration', '40')
  await page.fill('#avg_hr', '155')
  await page.getByRole('radio', { name: '7', exact: true }).click()
  await page.getByRole('button', { name: 'Save ride' }).click()
  await page.waitForSelector('article.card')

  const queued = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('ridelab_offline_queue') ?? '[]'),
  )
  check('the offline ride is queued, not lost', queued.length, 1)
  check('the queued ride keeps its values', queued[0]?.record?.distance_mi, 8)
  check('the server did not receive it yet', db.rides.length, 1)

  const localRides = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('ridelab_rides') ?? '[]'),
  )
  check('both rides are readable locally', localRides.length, 2)

  console.log('\nComing back online')
  offline = false
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('ridelab_offline_queue') ?? '[]').length === 0,
    { timeout: 10000 },
  )
  check('the queue drains', db.rides.length, 2)
  // Idempotency: the retry must not create a second copy of the same ride.
  check('no duplicate ride is created', new Set(db.rides.map((r) => r.id)).size, 2)

  console.log('\nDeleting offline')
  // A row deleted offline is only removed locally — the server still has it.
  // If a fetch lands before the queued delete syncs, a naive merge brings the
  // ride back from the dead.
  // A throwaway ride, logged online so the server really has it, then deleted.
  // Deleting one of the two real rides would break every later assertion.
  await page.locator('.nav-item', { hasText: 'Rides' }).click()
  await page.getByRole('button', { name: /Log/ }).click()
  await page.waitForSelector('#distance')
  await page.fill('#route', 'Throwaway')
  await page.fill('#distance', '1')
  await page.fill('#duration', '5')
  await page.getByRole('button', { name: 'Save ride' }).click()
  await page.waitForTimeout(800)
  check('the throwaway ride reaches the server', db.rides.length, 3)
  const victimId = db.rides.find((r) => r.route_name === 'Throwaway').id

  page.once('dialog', (d) => d.accept())
  offline = true
  // Scope to the throwaway's own card: two rides logged in the same minute sort
  // arbitrarily, so .first() is not reliably the one we just made.
  await page
    .locator('article.card', { hasText: 'Throwaway' })
    .getByRole('button', { name: 'Delete ride' })
    .click()
  await page.waitForTimeout(600)

  const afterDelete = await page.evaluate(() => JSON.parse(localStorage.getItem('ridelab_rides') ?? '[]').length)
  check('the ride disappears locally', afterDelete, 2)
  check('the server still has it while offline', db.rides.length, 3)

  // Network returns, but the queued delete has not run yet.
  offline = false
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const stillGone = await page.evaluate(
    (id) => !JSON.parse(localStorage.getItem('ridelab_rides') ?? '[]').some((r) => r.id === id),
    victimId,
  )
  check('the deleted ride does not come back on refresh', stillGone, true)

  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('ridelab_offline_queue') ?? '[]').length === 0,
    { timeout: 10000 },
  )
  check('the delete reaches the server', db.rides.length, 2)
  check('only the throwaway was removed', db.rides.some((r) => r.route_name === 'Throwaway'), false)

  console.log('\nBody composition')
  await page.locator('.nav-item', { hasText: 'Body' }).click()
  await page.getByRole('button', { name: /Measure/ }).click()
  await page.waitForSelector('#weight')
  await page.fill('#weight', '185')
  await page.fill('#bf', '22')
  await page.fill('#waist', '34')
  await page.fill('#rhr', '62')
  await page.getByRole('button', { name: 'Save measurement' }).click()
  await page.waitForTimeout(800)
  check('the measurement is saved', db.body_comp.length, 1)
  check('the first measurement becomes the baseline', db.body_comp[0]?.is_baseline, true)
  check('resting HR is stored', db.body_comp[0]?.resting_hr, 62)

  console.log('\nJournal')
  await page.locator('.nav-item', { hasText: 'Journal' }).click()
  await page.getByRole('button', { name: /Write/ }).click()
  await page.waitForSelector('#body')
  await page.fill('#sleep', '7.5')
  await page.locator('#mood').getByRole('radio', { name: '4' }).click()
  await page.locator('#energy').getByRole('radio', { name: '3' }).click()
  await page.fill('#body', 'Legs felt good. Climbing is getting easier.')
  await page.getByRole('button', { name: 'Save entry' }).click()
  await page.waitForTimeout(800)
  check('the entry is saved', db.journal_entries.length, 1)
  check('mood is stored', db.journal_entries[0]?.mood, 4)
  check('sleep is stored', db.journal_entries[0]?.sleep_hrs, 7.5)

  console.log('\nProgress')
  await page.locator('.nav-item', { hasText: 'Progress' }).click()
  await page.waitForSelector('h2')
  await page.waitForTimeout(1200)
  const progressText = await page.locator('.app-main').innerText()
  // The header renders this compactly as "W1/16"; it read "Week 1 of 16"
  // before the progress screen was redesigned.
  check('the study window is shown', /W\d+\/\d+/.test(progressText), true)

  // The findings card leads the screen. Before it, answering "is any of this
  // working?" meant reading eight charts and doing the comparison yourself.
  //
  // Matched case-insensitively: the app's own CSS renders headings and stat
  // labels uppercase, and innerText returns what is painted, not the source.
  const progressLower = progressText.toLowerCase()
  check('the findings lead the screen', progressLower.includes('where the study stands'), true)
  check('cardiac cost is stated first', progressLower.includes('cardiac cost'), true)
  check(
    'the headline explains what the number means',
    progressLower.includes('same work for fewer beats'),
    true,
  )
  check(
    'an unfinished window says what it is waiting for',
    /\d+ of 42 days/.test(progressText),
    true,
  )
  check('heart rate zones are explained', progressText.includes('Endurance'), true)
  check('total distance is summarised', progressText.includes('20.4'), true)
  const charts = await page.locator('.recharts-wrapper').count()
  check('charts render', charts > 0, true)
  await page.screenshot({ path: 'tests/screenshot-progress.png', fullPage: true })

  // The exported case study is the artefact other people read, so what it says
  // about its own limits matters as much as its numbers. The first real export
  // ended on a bare "## 5." heading — an empty list spread under a title — and
  // stated an ACWR of 5.15 as "Danger Zone" in week one, when that ratio was
  // measuring an empty 28-day denominator rather than the rider.
  const downloadPromise = page.waitForEvent('download')
  await page.locator('button', { hasText: 'Export Study' }).click()
  const download = await downloadPromise
  const report = readFileSync(await download.path(), 'utf8')

  check('the export names its own data maturity', report.includes('**Data maturity:**'), true)
  check(
    'an immature ACWR is not stated as a verdict',
    /ACWR[^\n]*not yet interpretable/.test(report),
    true,
  )
  check('CTL is marked provisional before 42 days', /CTL[^\n]*provisional/.test(report), true)
  check(
    'section 5 says what it cannot measure yet',
    report.includes('No route ridden twice yet'),
    true,
  )
  check('the report does not end on a bare heading', /##\s*5\.[^\n]*\n*\s*$/.test(report), false)

  console.log('\nRoutes')
  await page.locator('.nav-item', { hasText: 'Routes' }).click()
  await page.waitForSelector('article.card')
  const routesText = await page.locator('.app-main').innerText()
  check('the route library lists Slaughter Pen', routesText.includes('Slaughter Pen'), true)
  check('per-route ride counts appear', routesText.includes('Ridden'), true)
  // The ride logged above was entered by hand, so it carries no GPS track and
  // there is nothing to match. The card must say that rather than crash or
  // imply a segment exists.
  // Headings are uppercased by CSS, so compare case-insensitively.
  check('the segments card renders', /repeat segments/i.test(routesText), true)
  check(
    'and reports honestly that there is nothing to match yet',
    /Segments are found automatically/.test(routesText),
    true,
  )

  console.log('\nLayout')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  )
  check('the page never scrolls sideways on a phone', overflow, false)

  await page.screenshot({ path: 'tests/screenshot-routes.png', fullPage: true })

  await browser.close()

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
