/**
 * Total Daily Energy Expenditure: how many calories a day actually holds
 * weight steady, and what to eat instead to reach a target.
 *
 * Two ways to get there, in order of preference:
 *
 *   1. Empirically, from tracked calorie intake and the resulting weight
 *      change over the same window. This is the number that is actually true
 *      for this rider on this training load — a formula cannot see how much
 *      the bike itself is burning.
 *   2. Mifflin-St Jeor plus an activity multiplier, when there is not yet
 *      enough logged intake to compute the real number. It is a population
 *      average, not a measurement, and the UI has to say so.
 *
 * Weight itself is noisy day to day (water, sodium, glycogen, digestion), so
 * both paths lean on more than one measurement rather than two single points.
 */

/** Calories per pound of body mass gained or lost — the standard estimate. */
export const KCAL_PER_LB = 3500

/**
 * Minimum days of paired calorie/weight data before an empirical TDEE is
 * offered instead of the formula. Short of this, day-to-day water-weight
 * noise dominates the signal: a single big-carb-refeed day can swing bodyweight
 * several pounds and make a 3-day estimate wrong by hundreds of calories.
 */
export const MIN_EMPIRICAL_DAYS = 10

/**
 * TDEE from what was actually eaten and what actually happened to weight.
 *
 * Takes body_comp rows (each optionally carrying weight_lbs and calories_in)
 * and returns the average daily intake over the window minus the daily
 * calorie-equivalent of the weight trend — the number of calories a day that,
 * eaten during this exact training block, would have held weight flat.
 *
 * Returns null rather than a shaky guess when there are too few days with
 * both figures present, or when every logged day has identical weight (no
 * trend to measure against).
 */
export function empiricalTdee(bodyComp = [], { minDays = MIN_EMPIRICAL_DAYS } = {}) {
  const rows = bodyComp
    .filter((r) => r?.measured_at && r.weight_lbs != null && r.calories_in != null)
    .map((r) => ({
      date: r.measured_at,
      weightLbs: Number(r.weight_lbs),
      caloriesIn: Number(r.calories_in),
    }))
    .filter((r) => Number.isFinite(r.weightLbs) && Number.isFinite(r.caloriesIn))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (rows.length < minDays) return null

  const first = rows[0]
  const last = rows[rows.length - 1]
  const days = (new Date(last.date) - new Date(first.date)) / 86_400_000
  if (days < minDays - 1) return null // same window check, by elapsed time rather than row count

  const avgCaloriesIn = rows.reduce((sum, r) => sum + r.caloriesIn, 0) / rows.length

  // Trend end-to-end rather than day-to-day, so a single noisy weigh-in near
  // either edge does not dominate — the average of ten daily deltas would put
  // as much weight on one bad night's water retention as on nine good ones.
  const weightChangeLbs = last.weightLbs - first.weightLbs
  const dailyCalorieEquivalent = (weightChangeLbs * KCAL_PER_LB) / days

  return {
    tdee: Math.round(avgCaloriesIn - dailyCalorieEquivalent),
    avgCaloriesIn: Math.round(avgCaloriesIn),
    weightChangeLbs: Math.round(weightChangeLbs * 10) / 10,
    days: Math.round(days),
    sampleDays: rows.length,
  }
}

/** Activity multipliers over BMR, the standard Harris-Benedict/Mifflin bands. */
export const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
}

/**
 * Mifflin-St Jeor BMR, times an activity multiplier — the fallback estimate
 * for when there is not yet enough tracked intake for empiricalTdee.
 *
 * Mifflin-St Jeor rather than the older Harris-Benedict: it is the equation
 * modern dietetics guidance (Academy of Nutrition and Dietetics) recommends
 * as more accurate against measured resting metabolic rate.
 *
 * Returns null when a required input is missing rather than silently assuming
 * a sex or a height — those change the answer by hundreds of calories, and a
 * wrong number stated with the same confidence as a right one is worse than
 * an honest "need more info".
 */
export function formulaTdee({
  weightLbs,
  heightIn,
  age,
  sex,
  activityLevel = 'moderate',
} = {}) {
  if (
    !Number.isFinite(weightLbs) ||
    !Number.isFinite(heightIn) ||
    !Number.isFinite(age) ||
    (sex !== 'male' && sex !== 'female')
  ) {
    return null
  }

  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? ACTIVITY_MULTIPLIERS.moderate

  const kg = weightLbs / 2.20462
  const cm = heightIn * 2.54
  // Mifflin-St Jeor: 10*kg + 6.25*cm - 5*age, +5 for male / -161 for female.
  const bmr = 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161)

  return {
    tdee: Math.round(bmr * multiplier),
    bmr: Math.round(bmr),
    activityLevel,
    multiplier,
  }
}

/**
 * Daily calorie target to reach a goal weight in a given number of weeks, at
 * a rate capped for safety and for muscle retention during training.
 *
 * The cap matters here specifically because this rider is mid-training-block
 * for a race: an aggressive cut competing with the same calories that fuel
 * gravel volume risks the exact fatigue/HRV problems already being tracked
 * elsewhere in this app. 0.5–1% of bodyweight per week is the range distance
 * sport nutrition guidance (e.g. Burke et al.) treats as sustainable without
 * eating into training capacity; this caps at 1%.
 *
 * Returns the target with `capped: true` when the requested timeline would
 * have needed a faster rate than that, so the UI can show the honest number
 * (and the honest timeline) rather than a deficit nobody should actually eat.
 */
export function caloriesForTargetWeight({
  tdee,
  currentWeightLbs,
  targetWeightLbs,
  weeks,
  maxWeeklyChangePct = 0.01,
} = {}) {
  if (
    !Number.isFinite(tdee) ||
    !Number.isFinite(currentWeightLbs) ||
    !Number.isFinite(targetWeightLbs) ||
    !Number.isFinite(weeks) ||
    weeks <= 0
  ) {
    return null
  }

  const totalChangeLbs = targetWeightLbs - currentWeightLbs
  const requestedWeeklyChangeLbs = totalChangeLbs / weeks
  const maxWeeklyChangeLbs = currentWeightLbs * maxWeeklyChangePct

  const cappedWeeklyChangeLbs =
    Math.abs(requestedWeeklyChangeLbs) > maxWeeklyChangeLbs
      ? Math.sign(requestedWeeklyChangeLbs) * maxWeeklyChangeLbs
      : requestedWeeklyChangeLbs

  const dailyDeficitOrSurplus = (cappedWeeklyChangeLbs * KCAL_PER_LB) / 7
  const dailyCalories = Math.round(tdee + dailyDeficitOrSurplus)

  const capped = cappedWeeklyChangeLbs !== requestedWeeklyChangeLbs
  const actualWeeks = capped
    ? Math.abs(totalChangeLbs / cappedWeeklyChangeLbs)
    : weeks

  return {
    dailyCalories,
    weeklyChangeLbs: Math.round(cappedWeeklyChangeLbs * 100) / 100,
    capped,
    weeks: capped ? Math.ceil(actualWeeks) : Math.round(weeks),
  }
}
