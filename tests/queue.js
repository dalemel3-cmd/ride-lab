/**
 * Offline-queue diagnostics.
 *
 * Exercises the failure path specifically: what happens to an entry that can
 * never sync. Run with the preview server up:
 *   node tests/queue.js
 *
 * The store reads and writes localStorage and talks to Supabase, so this drives
 * it inside a real page with the network stubbed, rather than trying to fake a
 * browser in Node.
 */

import { chromium } from 'playwright'

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:4173'
const USER_ID = '00000000-0000-4000-8000-000000000001'

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

// "always rejects" simulates a row the server will never accept — a constraint
// violation or an RLS refusal, as opposed to a flat network outage.
let mode = 'reject'

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()

  await page.route('**/*.supabase.co/**', async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname.includes('/auth/v1/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'stub',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'stub',
          user: { id: USER_ID },
        }),
      })
    }

    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }

    if (mode === 'reject') {
      // A permanent, server-side "no".
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'violates check constraint "rides_rpe_check"' }),
      })
    }

    return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
  })

  await page.addInitScript((id) => {
    localStorage.setItem(
      'ridelab_auth',
      JSON.stringify({
        access_token: 'stub',
        token_type: 'bearer',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'stub',
        user: { id },
      }),
    )
    localStorage.setItem('ridelab_signed_in_before', '1')
    // Pretend the starter routes were already planted, so the seeding writes
    // don't pollute the queue this test is measuring.
    localStorage.setItem('ridelab_routes_seeded', '1')
  }, USER_ID)

  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.bottom-nav', { timeout: 15000 })

  console.log('\nA row the server always rejects')
  await page.evaluate(async () => {
    const store = await import('/src/data/store.js')
    await store.saveRow('rides', { ridden_at: new Date().toISOString(), route_name: 'Doomed', rpe: 99 })
  })

  check(
    'the rejected row is queued rather than lost',
    await page.evaluate(() => JSON.parse(localStorage.getItem('ridelab_offline_queue') ?? '[]').length),
    1,
  )

  console.log('\nRepeated sync attempts')
  const afterAttempts = await page.evaluate(async () => {
    const store = await import('/src/data/store.js')
    // One more than the stuck threshold, to cross it.
    for (let i = 0; i < 6; i += 1) await store.syncQueue()
    return {
      queued: JSON.parse(localStorage.getItem('ridelab_offline_queue') ?? '[]').length,
      stuck: store.stuckEntries().length,
      error: store.stuckEntries()[0]?.error ?? null,
      attempts: store.stuckEntries()[0]?.attempts ?? 0,
    }
  })

  check('it is never silently discarded', afterAttempts.queued, 1)
  check('it is reported as stuck, not merely pending', afterAttempts.stuck, 1)
  check('the attempt count is tracked', afterAttempts.attempts >= 5, true)
  check(
    'the reason is captured for the user to read',
    afterAttempts.error?.includes('rides_rpe_check'),
    true,
  )

  console.log('\nA transient failure is not treated as stuck')
  const transient = await page.evaluate(async () => {
    const store = await import('/src/data/store.js')
    localStorage.setItem('ridelab_offline_queue', '[]')
    await store.saveRow('rides', { ridden_at: new Date().toISOString(), route_name: 'Flaky' })
    await store.syncQueue()
    return { stuck: store.stuckEntries().length, queued: store.readQueue().length }
  })
  check('one failure does not flag it as stuck', transient.stuck, 0)
  check('but it stays queued for retry', transient.queued, 1)

  console.log('\nRecovery once the server accepts it')
  mode = 'accept'
  const recovered = await page.evaluate(async () => {
    const store = await import('/src/data/store.js')
    const result = await store.syncQueue()
    return { remaining: result.remaining, synced: result.synced }
  })
  check('the queue drains', recovered.remaining, 0)
  check('and reports what it sent', recovered.synced, 1)

  console.log('\nDiscarding is explicit')
  const discarded = await page.evaluate(async () => {
    const store = await import('/src/data/store.js')
    localStorage.setItem(
      'ridelab_offline_queue',
      JSON.stringify([{ action: 'upsert', table: 'rides', id: 'abc', record: {}, retry_count: 9 }]),
    )
    store.discardQueuedEntry('abc')
    return store.readQueue().length
  })
  check('a discarded entry is removed', discarded, 0)

  await browser.close()
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
