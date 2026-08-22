/**
 * GPX parsing tests.
 *
 * Runs in a browser page because the parser uses DOMParser, which Node has no
 * built-in equivalent for. Needs the *dev* server specifically — it imports the
 * module by source path, which the built preview does not serve:
 *   npm run dev
 *   APP_URL=http://127.0.0.1:5173 node tests/gpx.js
 *
 * The fixtures below use the exact shapes real exporters produce, including
 * the namespaced heart-rate extension that Strava and Garmin emit — the part
 * most likely to be got wrong by assuming rather than checking.
 */

import { chromium } from 'playwright'

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

function checkClose(name, actual, expected, tolerance) {
  const ok = actual != null && Math.abs(actual - expected) <= tolerance
  if (ok) {
    console.log(`  ok   ${name} → ${actual}`)
    passed += 1
  } else {
    console.error(`  FAIL ${name}`)
    console.error(`       expected: ${expected} (±${tolerance})`)
    console.error(`       actual:   ${actual}`)
    failed += 1
  }
}

// Strava's export shape: gpxtpx-namespaced heart rate inside extensions.
const STRAVA_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata><time>2026-08-18T12:00:00Z</time></metadata>
  <trk>
    <name>Slaughter Pen Loop</name>
    <type>MountainBikeRide</type>
    <trkseg>
      <trkpt lat="36.3729" lon="-94.2088">
        <ele>380.0</ele><time>2026-08-18T12:00:00Z</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>120</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
      <trkpt lat="36.3829" lon="-94.2088">
        <ele>400.0</ele><time>2026-08-18T12:10:00Z</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>150</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
      <trkpt lat="36.3929" lon="-94.2088">
        <ele>395.0</ele><time>2026-08-18T12:20:00Z</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>180</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`

// A bare export: no heart rate, no elevation, no times.
const MINIMAL_GPX = `<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="36.3729" lon="-94.2088"></trkpt>
    <trkpt lat="36.3829" lon="-94.2088"></trkpt>
  </trkseg></trk>
</gpx>`

const NO_TRACK_GPX = `<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1"><wpt lat="36.3" lon="-94.2"></wpt></gpx>`

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  })
  const page = await browser.newPage()
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })

  const run = (gpx) =>
    page.evaluate(async (text) => {
      const { parseGpx } = await import('/src/data/gpx.js')
      try {
        return { ok: true, value: parseGpx(text) }
      } catch (e) {
        return { ok: false, error: String(e.message) }
      }
    }, gpx)

  console.log('\nA Strava export')
  const strava = (await run(STRAVA_GPX)).value
  check('reads the activity name', strava.name, 'Slaughter Pen Loop')
  check('counts every track point', strava.pointCount, 3)
  // Two hops of 0.01° latitude ≈ 0.69 mi each.
  checkClose('computes distance from the track', strava.distanceMi, 1.38, 0.05)
  check('derives duration from timestamps', strava.durationMin, 20)
  check('detects heart rate in the namespaced extension', strava.hasHeartRate, true)
  check('averages heart rate', strava.avgHr, 150)
  check('takes the maximum heart rate', strava.maxHr, 180)
  // Climbs 20m, then descends 5m — only the climb counts.
  checkClose('sums only positive elevation change', strava.elevationFt, 65.6, 1)
  check('keeps the start time', strava.startedAt, '2026-08-18T12:00:00.000Z')

  // Per-point elevation and heart rate ride along on the track itself. Without
  // them, nothing shorter than a whole ride can be measured — no segment heart
  // rate, no climb profile, no VAM.
  check('track points carry five values', strava.track[0].length, 5)
  check('elevation is stored per point, in metres', strava.track[0][3], 380)
  check('heart rate is stored per point', strava.track[0][4], 120)
  check('the last point keeps its own values', strava.track[2][4], 180)

  console.log('\nA bare export with no extras (per-point)')
  const bare = (await run(MINIMAL_GPX)).value
  check('points are still five wide', bare.track[0].length, 5)
  check('absent elevation is null, not zero', bare.track[0][3], null)
  check('absent heart rate is null, not zero', bare.track[0][4], null)

  console.log('\nA bare export with no extras')
  const minimal = (await run(MINIMAL_GPX)).value
  check('still computes distance', minimal.distanceMi > 0, true)
  check('missing heart rate is null, not zero', minimal.avgHr, null)
  check('missing duration is null, not zero', minimal.durationMin, null)
  check('missing elevation is null', minimal.elevationFt, null)
  check('no name is null rather than empty', minimal.name, null)

  console.log('\nFiles that cannot be imported')
  check('a file with no track returns null', (await run(NO_TRACK_GPX)).value, null)
  const broken = await run('this is not xml at all <<<')
  check('malformed input is reported, not swallowed', broken.ok, false)

  await browser.close()
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
