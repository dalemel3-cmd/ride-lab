/**
 * Pure helpers for turning wearable health samples into one value per day.
 *
 * Kept out of the Edge Function so the arithmetic that produces the case
 * study's HRV series can be tested in Node without a Deno toolchain or a live
 * Google token. See tests/health.js.
 */

/**
 * Plausible adult resting rMSSD, in milliseconds.
 *
 * Wide on purpose: this is a "did we read the wrong field" check, not a
 * physiological judgement. Trained endurance athletes record well over 150 ms
 * and a stressed or ill reading can fall into the teens, so the bounds only
 * catch a number that cannot be an rMSSD at all.
 */
export const HRV_RANGE = { min: 5, max: 400 }

export function isPlausibleHrv(ms: unknown): boolean {
  return typeof ms === 'number' && Number.isFinite(ms) && ms >= HRV_RANGE.min && ms <= HRV_RANGE.max
}

/**
 * The night's HRV from its individual samples.
 *
 * Health Connect writes an rMSSD reading every few minutes through sleep, so a
 * night is many samples rather than one number. Taking the last one to arrive —
 * which is what assigning each sample to its date does — reports a single
 * moment as though it were the night, and single rMSSD samples swing far more
 * than the nightly figure does: a real series read that way ran 37, 81, 110, 56
 * on consecutive nights for a rider whose average barely moved.
 *
 * The mean is what a Fitbit or Oura app shows and what the Plews ln(rMSSD)
 * method assumes, so it is also the only value that makes the ±0.5 SD bands
 * mean anything.
 *
 * Returns null when nothing usable came through, so a day with no reading stays
 * empty rather than being charted as a zero.
 */
export function nightlyHrv(samples: readonly unknown[]): number | null {
  const usable = samples.filter(isPlausibleHrv) as number[]
  if (usable.length === 0) return null
  const mean = usable.reduce((sum, v) => sum + v, 0) / usable.length
  return Math.round(mean)
}
