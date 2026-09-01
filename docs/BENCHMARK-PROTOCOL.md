# Benchmark protocol

The single measurement this case study turns on. Everything else in the app
describes training; this is the test.

The logic is one sentence: **hold the physiological cost constant and measure
what it buys.** A ride is faster either because the rider got fitter or because
the rider worked harder, and only a controlled effort tells the two apart. So
the target is a heart rate, never a time. Chasing a time turns the test into a
race and destroys the thing it is meant to measure.

## The course

**Razorback Greenway, 16 miles**, first ridden 2026-08-23.

| | |
| --- | --- |
| Distance | 16.33 mi |
| Moving time | 95:48 |
| Elevation | 415 ft |
| Surface | paved trail |
| Average HR | 134 bpm |
| Peak HR | 165 bpm |
| RPE | 7 |
| Beats per mile | 786 |
| Speed at 120–135 bpm | 9.96 mph over 40.2 min |

Zone split on the day: 5% Z1, 42% Z2, **49% Z3**, 4% Z4. Nearly half of it sat
just above the Zone 2 ceiling, and 48% of the ride fell inside 128–142 bpm —
which is what makes the target band below a description of what was actually
done rather than an invention.

Ride the same direction, the same start and finish, every time. If the route
ever has to change, that ends the series: start a new one rather than comparing
across two courses.

## The target

**Hold 128–142 bpm for the whole ride.** Centred on the original 134.

- Put heart rate on the head unit or phone screen. Not speed.
- Above 142 — ease off immediately, including uphill. Drop to the easiest gear
  and let the speed collapse. A climb ridden at 155 invalidates the test.
- Below 128 on a descent is fine. Do not chase the band downhill.
- Do not sprint the finish. There is nothing to win.

Expect it to feel like a firm but sustainable effort — RPE around 7, able to
speak in short sentences but not comfortably.

## Controls

Record all of these in the ride notes. They are what lets a reader decide
whether a change is real.

**Fixed, ride to ride:**

- Same bike, same tyres, **same tyre pressure** — check with a gauge, do not
  guess. A 10 psi difference is worth real watts on a trail.
- Same start time, ±1 hour. The 2026-08-23 benchmark started 09:22.
- Same fed state. Original was a morning ride; keep it that way, and note what
  was eaten and when.
- Same warm-up: 10 minutes easy in Zone 1 before the clock starts.
- No hard ride the day before. Check form (TSB) is not below −30.

**Recorded, not fixed — because they cannot be:**

- **Temperature (°F).** There is a `temperature_f` field on the ride. Fill it in.
- **Wind direction and rough speed.** Both August rides on this course noted
  headwind; it is the largest uncontrolled variable on an exposed greenway.
- Sleep hours the night before, and morning HRV and resting HR — all three sync
  from Google Health already, so this is just a matter of not skipping the
  morning reading.

## Cadence

Repeat every **four weeks**, with a shakedown week in between if equipment has
been touched. Four repeats across the 16 weeks is enough for a trend and few
enough that each one gets ridden properly.

Next due: four weeks from the first clean repeat.

## What to compare

In order of how much weight each carries:

1. **Moving time at the target band.** Same course, same cardiac cost, less
   time. This is the headline.
2. **Speed at 120–135 bpm** (`aerobicEfficiencyTrend`). The benchmark has 40
   minutes in this band — the best-sampled ride in the log — so it is a strong
   secondary.
3. **Beats per mile.** Only meaningful here *because* effort is controlled. It
   is not a valid comparison between ordinary rides at different intensities.
4. **RPE at the same heart rate.** If 134 bpm starts to feel like a 5 rather
   than a 7, that is a real adaptation and one the numbers alone will not show.

## The confound that could sink this

**August to December in Arkansas is a 40–50 °F swing, and heat raises heart rate
at any given workload.** Cardiac drift in the heat can be worth 5–10 bpm, which
is the same order as the improvement being looked for.

That biases the December result **in the flattering direction**: colder air will
make the rider look fitter than they are. It has to be stated in the write-up,
not discovered by the reader.

Two things reduce the damage:

- Record temperature every time, so the size of the swing is visible.
- Weight the mid-study repeats — late September, late October — most heavily.
  They sit between the extremes and carry the least seasonal bias.

If a December repeat shows a large gain, the honest framing is "improvement,
with some part of it attributable to a 45 °F drop in air temperature", and the
September-to-October comparison is the cleaner evidence.

## What would make a result real

A single repeat is a data point. The claim gets strong when:

- Moving time falls by more than about **3 minutes** on 96 — smaller than that
  is inside the day-to-day noise of wind and traffic lights.
- The direction holds across **three or more** repeats rather than two.
- Resting heart rate and HRV are moving the same way over the same period.
- The ride was not excluded, and nothing broke on it.
