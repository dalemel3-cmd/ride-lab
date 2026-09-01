/**
 * Daily HRV aggregation.
 *
 * The HRV series is the case study's readiness evidence and feeds the Plews
 * ln(rMSSD) bands, so what a night's number actually represents is checked here
 * rather than assumed. The bug these tests exist to prevent: Health Connect
 * sends many rMSSD samples per night, and keeping the last one to arrive
 * reports a single moment as the night.
 *
 * The module under test is Deno/TypeScript and is transpiled on the fly by
 * stripping type annotations, the same way tests/ridewithgps.js does it.
 *
 *   node tests/health.js
 */

import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

// ---- Load the Deno module as plain JS -------------------------------------
const source = readFileSync(
  new URL('../supabase/functions/_shared/health.ts', import.meta.url),
  'utf8',
)

const stripped = source
  .replace(/^export type .*$/gm, '')
  .replace(/^type .*$/gm, '')
  .replace(/: (readonly unknown\[\]|number \| null|unknown|boolean|number)(?=[,)\s=])/g, '')
  .replace(/ as number\[\]/g, '')

const dir = mkdtempSync(join(tmpdir(), 'health-'))
const file = join(dir, 'health.mjs')
writeFileSync(file, stripped)

const { nightlyHrv, isPlausibleHrv, HRV_RANGE } = await import(`file://${file}`)

assert.equal(typeof nightlyHrv, 'function', 'nightlyHrv must load')
assert.equal(typeof isPlausibleHrv, 'function', 'isPlausibleHrv must load')

console.log('\nPlausibility bounds')
check('a normal resting rMSSD passes', isPlausibleHrv(98), true)
check('so does a very high trained one', isPlausibleHrv(180), true)
check('the bounds are inclusive at the bottom', isPlausibleHrv(HRV_RANGE.min), true)
check('and at the top', isPlausibleHrv(HRV_RANGE.max), true)
// These are the "we read the wrong field" cases the bounds exist for: a
// percentage, a heart rate in bpm scaled wrong, or a raw microsecond value.
check('zero is not an rMSSD', isPlausibleHrv(0), false)
check('nor is a microsecond-scale number', isPlausibleHrv(98_000), false)
check('nor is a negative', isPlausibleHrv(-12), false)
check('a missing reading is not plausible', isPlausibleHrv(null), false)
check('nor is a string that looks like one', isPlausibleHrv('98'), false)
check('nor NaN', isPlausibleHrv(Number.NaN), false)

console.log('\nNightly HRV from samples')
// The whole point: a night is the mean of its samples, not its last one.
// Worked by hand — (88 + 104 + 96 + 104) / 4 = 98.
const night = [88, 104, 96, 104]
check('a night is the mean of its samples', nightlyHrv(night), 98)
check('and not the last sample', nightlyHrv(night) === night[night.length - 1], false)
check('nor the highest', nightlyHrv(night) === Math.max(...night), false)

// This is the real failure that started it: sample-level swings are far wider
// than nightly ones, so last-wins produced a 116 on a night whose average was
// 98. Both readings are real; only one describes the night.
check('a late outlier does not become the night', nightlyHrv([88, 92, 90, 116]), 97)

// Rounding is to the nearest whole millisecond — the column is an integer and
// tenths of a millisecond of rMSSD are noise, not signal.
check('the mean is rounded, not truncated', nightlyHrv([90, 91]), 91)
check('a single sample is that sample', nightlyHrv([73]), 73)

console.log('\nNothing usable')
// A day with no reading must stay empty. Returning 0 would chart as a
// catastrophic HRV crash and drag the ln(rMSSD) baseline with it.
check('no samples is null, not zero', nightlyHrv([]), null)
check('only implausible samples is null', nightlyHrv([0, -5, 98_000]), null)
check('implausible samples are dropped from the mean', nightlyHrv([98, 0, 102]), 100)

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
