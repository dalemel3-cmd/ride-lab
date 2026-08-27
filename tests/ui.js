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
  check('bottom nav has seven destinations', await page.locator('.nav-item').count(), 7)
  // Settings used to be reachable only from the sidebar, which is display:none
  // below 768px — so on a phone the only way in was typing the #settings hash.
  check(
    'settings is reachable on a phone',
    await page.locator('.nav-item', { hasText: 'Settings' }).isVisible(),
    true,
  )
  // Headings are uppercased by CSS, so compare case-insensitively.
  check(
    'lands on the athlete cockpit',
    (await page.locator('h2').first().innerText()).toLowerCase(),
    'athlete cockpit',
  )

  // Nothing is seeded any more. The trail library moved to Strava; this app
  // keeps only the comparison Strava cannot make.
  const seededRoutes = await page.evaluate(
    () => JSON.parse(localStorage.getItem('ridelab_routes') ?? '[]').length,
  )
  check('no trail library is planted on a new account', seededRoutes, 0)

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
  await page.locator('button', { hasText: 'Markdown' }).click()
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

  console.log('\nStudy report and share card')
  // Both exports have to agree with what the screen says, so they are opened
  // from the screen rather than built from their own copy of the numbers.
  await page.locator('.nav-item', { hasText: 'Progress' }).click()
  await page.waitForSelector('h2')
  await page.waitForTimeout(600)

  await page.locator('button', { hasText: 'Report' }).click()
  await page.waitForSelector('.study-report')
  const reportText = (await page.locator('.study-report').innerText()).toLowerCase()
  check('the report opens as a document', reportText.includes('cycling physiological case study'), true)
  check('it carries the method and its sources', reportText.includes('banister'), true)
  check('it states the data maturity', reportText.includes('data maturity'), true)
  check('it says what it cannot measure yet', reportText.includes('no course has been ridden twice'), true)
  // Printing hides the app rather than printing the phone shell around it.
  const printReady = await page.evaluate(() => document.body.classList.contains('report-open'))
  check('print mode is armed while the report is open', printReady, true)

  await page.locator('.study-report button', { hasText: 'Close' }).click()
  await page.waitForTimeout(200)
  check('closing puts the app back', await page.locator('.study-report').count(), 0)
  check('and disarms print mode', await page.evaluate(() => document.body.classList.contains('report-open')), false)

  // Downloaded rather than imported: the built preview serves no /src, and the
  // download is the path the rider actually takes. PNG dimensions live in the
  // IHDR chunk at bytes 16-23, so the file itself proves the size.
  const cardPromise = page.waitForEvent('download')
  await page.locator('button', { hasText: 'Card' }).click()
  const cardDownload = await cardPromise
  const png = readFileSync(await cardDownload.path())

  check('a PNG is produced', png.subarray(1, 4).toString(), 'PNG')
  check('square at Instagram resolution', [png.readUInt32BE(16), png.readUInt32BE(20)], [1080, 1080])
  // A blank canvas compresses to almost nothing; a drawn one does not.
  check('and something was actually drawn on it', png.length > 8000, true)
  check('named for the study week', /ride-lab-week-\d+\.png/.test(cardDownload.suggestedFilename()), true)

  // Nothing may touch the frame. The card is generated from whatever the ride
  // happened to be, so widths are not knowable in advance — a long value like
  // "28h 40m" at a fixed size ran straight past the right edge, and a footnote
  // that wrapped to two lines crossed the rule above the footer.
  //
  // Measured on the PNG that was actually downloaded, decoded back into a
  // canvas in the page. Re-rendering from source would test a different code
  // path from the one the rider gets, and the built preview serves no /src.
  const framing = await page.evaluate(
    (dataUrl) =>
      new Promise((resolve) => {
        const img = new Image()
        img.addEventListener('load', () => {
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0)
          // A 24px gutter just inside the frame must stay empty on both sides.
          const strip = (x) => {
            const { data } = ctx.getImageData(x, 0, 24, canvas.height)
            let lit = 0
            for (let i = 0; i < data.length; i += 4) {
              if (data[i] + data[i + 1] + data[i + 2] > 260) lit += 1
            }
            return lit
          }
          resolve({ left: strip(8), right: strip(canvas.width - 32) })
        })
        img.src = dataUrl
      }),
    `data:image/png;base64,${png.toString('base64')}`,
  )
  check('nothing spills past the left frame', framing.left, 0)
  check('nothing spills past the right frame', framing.right, 0)

  console.log('\nRepeats')
  await page.locator('.nav-item', { hasText: 'Repeats' }).click()
  await page.waitForSelector('h2')
  await page.waitForTimeout(400)
  const routesText = await page.locator('.app-main').innerText()
  // One ride was logged above, so there is nothing to compare yet — but the
  // course it was ridden on is a candidate for a second attempt, and saying so
  // is the whole point of the screen.
  check('the screen states why repeating a course matters', /same ground twice/i.test(routesText), true)
  check(
    'a single ride is offered as a repeat candidate',
    routesText.includes('Slaughter Pen Classic Loop'),
    true,
  )
  check('and the empty comparison says what would fill it', /No course ridden twice yet/i.test(routesText), true)
  // The trail library is gone: no difficulty grades, no navigation.
  check('no trail library remains', /Navigate in Google Maps/i.test(routesText), false)
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
  await page.screenshot({ path: 'tests/screenshot-repeats.png', fullPage: true })

  console.log('\nMetrics & method')
  // :visible matters here. Both navs are in the DOM at every width — the
  // sidebar is display:none on a phone rather than absent — so an unfiltered
  // locator resolves to the hidden desktop button and waits forever. Filtering
  // on visibility is also what makes this a real test of phone reachability:
  // it fails if the only route to Settings is one a phone cannot take.
  await page.locator('.sidebar-item:visible, .nav-item:visible', { hasText: 'Settings' }).first().click()
  await page.waitForSelector('h2')
  await page.waitForTimeout(400)
  const settingsText = (await page.locator('.app-main').innerText()).toLowerCase()

  // A case study nobody can check is a blog post. Each headline metric has to
  // name its own method and its own source.
  check('the guide is present', settingsText.includes('metrics & method'), true)
  for (const metric of ['cardiac cost', 'resting heart rate', 'hrv (rmssd)', 'fitness (ctl)']) {
    check(`${metric} is documented`, settingsText.includes(metric), true)
  }

  // Opened rather than read through the collapsed element: innerText returns
  // only what is rendered, so a closed <details> reports its summary alone.
  // Clicking it also proves the disclosure itself works.
  const cardiacEntry = page.locator('details', { hasText: 'Cardiac cost' }).first()
  await cardiacEntry.locator('summary').click()
  const guideDetail = (await cardiacEntry.innerText()).toLowerCase()
  check('the detail is real, not a stub', guideDetail.includes('what it measures'), true)
  check('and it cites a source', guideDetail.includes('source'), true)
  // Cardiac cost is the one metric here that is not a published index. Saying so
  // is the difference between a case study and a dashboard.
  check(
    'cardiac cost admits what it is not',
    guideDetail.includes('closest honest substitute'),
    true,
  )
  await page.screenshot({ path: 'tests/screenshot-settings.png', fullPage: true })

  console.log('\nLayout')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  )
  check('the page never scrolls sideways on a phone', overflow, false)

  await browser.close()

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
