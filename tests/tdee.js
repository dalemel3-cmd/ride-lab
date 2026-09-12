/**
 * TDEE: empirical (calories-in vs. weight trend), formula fallback, and the
 * target-weight calorie calculator.
 *
 *   node tests/tdee.js
 */

import {
  empiricalTdee,
  formulaTdee,
  caloriesForTargetWeight,
  ACTIVITY_MULTIPLIERS,
} from '../src/data/tdee.js'

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

console.log('\nEmpirical TDEE')

// 11 days, weight falling 160 -> 155 while eating a steady 2000 kcal/day.
// Worked by hand: avg intake 2000, weight change -5 lbs over 10 elapsed days,
// calorie-equivalent of that change = -5*3500/10 = -1750/day, so
// tdee = 2000 - (-1750) = 3750 — this rider is eating well below what it
// actually takes to hold this weight steady during this training block.
const losingRows = Array.from({ length: 11 }, (_, i) => ({
  measured_at: `2026-01-${String(i + 1).padStart(2, '0')}`,
  weight_lbs: 160 - i * 0.5,
  calories_in: 2000,
}))
check('tdee is intake minus the calorie-equivalent of the weight trend', empiricalTdee(losingRows), {
  tdee: 3750,
  avgCaloriesIn: 2000,
  weightChangeLbs: -5,
  days: 10,
  sampleDays: 11,
})

check('fewer than the minimum days is null, not a shaky guess', empiricalTdee(losingRows.slice(0, 5)), null)
check('no rows at all', empiricalTdee([]), null)

check(
  'rows missing calories_in are dropped, not treated as zero',
  empiricalTdee([
    ...losingRows,
    { measured_at: '2026-01-12', weight_lbs: 154.5, calories_in: null },
  ]),
  empiricalTdee(losingRows),
)

console.log('\nFormula TDEE (Mifflin-St Jeor)')

// Worked by hand: 150lb / 70in / 30yo male, moderate activity (x1.55).
// kg = 68.0389, cm = 177.8
// bmr = 10*kg + 6.25*cm - 5*age + 5 = 1646.64
// tdee = bmr * 1.55 = 2552 (rounded)
check(
  'a complete profile returns bmr and tdee',
  formulaTdee({ weightLbs: 150, heightIn: 70, age: 30, sex: 'male', activityLevel: 'moderate' }),
  { tdee: 2552, bmr: 1647, activityLevel: 'moderate', multiplier: ACTIVITY_MULTIPLIERS.moderate },
)

check('missing sex returns null rather than guessing', formulaTdee({ weightLbs: 150, heightIn: 70, age: 30 }), null)
check(
  'missing height returns null',
  formulaTdee({ weightLbs: 150, age: 30, sex: 'male' }),
  null,
)
check(
  'an unrecognised activity level falls back to moderate',
  formulaTdee({ weightLbs: 150, heightIn: 70, age: 30, sex: 'male', activityLevel: 'made-up' }).tdee,
  formulaTdee({ weightLbs: 150, heightIn: 70, age: 30, sex: 'male', activityLevel: 'moderate' }).tdee,
)

console.log('\nCalories for a target weight')

// Worked by hand: 180 -> 170 lbs over 10 weeks = -1 lb/week, well under the 1%
// bodyweight/week cap (1.8 lb/week at 180lb), so it runs at the requested pace.
// -1 lb/week = -500 kcal/day deficit off a 2500 tdee = 2000 kcal/day.
check(
  'an achievable pace runs uncapped',
  caloriesForTargetWeight({ tdee: 2500, currentWeightLbs: 180, targetWeightLbs: 170, weeks: 10 }),
  { dailyCalories: 2000, weeklyChangeLbs: -1, capped: false, weeks: 10 },
)

// Worked by hand: the same 10lb loss requested over 2 weeks asks for -5
// lb/week, which the 1% cap (1.8 lb/week) will not allow. Capped weekly
// change -1.8 lb/week => daily deficit -1.8*3500/7 = -900 => 2500-900=1600.
// Real timeline to lose 10lb at 1.8lb/week = 5.56 weeks, rounded up to 6.
check('an unsafe pace is capped and the timeline is told straight', caloriesForTargetWeight({
  tdee: 2500,
  currentWeightLbs: 180,
  targetWeightLbs: 170,
  weeks: 2,
}), { dailyCalories: 1600, weeklyChangeLbs: -1.8, capped: true, weeks: 6 })

check(
  'gaining weight is the same arithmetic in the other direction',
  caloriesForTargetWeight({ tdee: 2500, currentWeightLbs: 150, targetWeightLbs: 155, weeks: 10 }),
  { dailyCalories: 2500 + Math.round((0.5 * 3500) / 7), weeklyChangeLbs: 0.5, capped: false, weeks: 10 },
)

check('missing inputs return null', caloriesForTargetWeight({ tdee: 2500, currentWeightLbs: 180 }), null)

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
