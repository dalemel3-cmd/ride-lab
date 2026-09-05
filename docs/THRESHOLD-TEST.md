# 20-minute threshold test

**Purpose:** measure lactate threshold heart rate (LTHR), the number every zone
in this study is anchored to.

**Frequency:** at the start of the study, then every 6–8 weeks. It doubles as a
progress metric — LTHR rising means the aerobic engine is genuinely improving,
which is a stronger case-study claim than any single ride.

**Time:** about an hour, door to door.

---

## Why this test exists

Zones were previously percentages of `maxHr = 190`. That number has never been
tested. Tanaka's formula predicts 187 for a 30-year-old, and across ~21,000
recorded heart-rate samples nothing has exceeded **170**.

That guess decides the study's headline verdict. Over the same 513 minutes of
riding:

| anchor | easy | grey zone | hard |
| --- | --- | --- | --- |
| % of max HR (190, untested) | 68.7% | 26.8% | 4.5% |
| threshold 152 (best on record) | 73.3% | 22.2% | 4.5% |
| threshold 160 (plausible) | 84.9% | 13.9% | 1.3% |

"Am I riding 80/20?" answers *no* or *yes* depending purely on which guess is
used. One test settles it.

**Why not test max HR instead?** Three reasons. It requires an all-out maximal
effort, which is unpleasant and carries more risk than it is worth for a
recreational study. It barely changes with training, so it says nothing about
progress. And it is the harder number to hit accurately — most people never
reach their true max in a field test anyway, which is exactly how an
underestimate becomes a permanently miscalibrated zone chart.

---

## Before the test

- **Not on tired legs.** No hard ride the day before, and no long ride within
  two days. Check the readiness score is not red.
- **Same course every time.** A flat, uninterrupted 20-minute stretch — no
  junctions, no lights, no descents long enough to coast. On the Razorback
  Greenway, pick a segment you can ride without stopping.
- **Record the conditions.** Temperature, wind, time of day, and what you ate.
  Heat alone can add 5–10 bpm at the same effort, and without a note the next
  test will read that as a fitness change.
- **Chest strap, not wrist.** The Polar strap. Wrist optical heart rate lags and
  smooths exactly the sort of sustained effort this test depends on.
- **Same device throughout.** Ride with GPS on the phone, or the head unit —
  pick one and keep it for every repeat.

## The test

| | |
| --- | --- |
| **1. Warm up** | 15 minutes easy, building to steady. Finish with 3 × 1 minute brisk (not sprinting) with a minute easy between, then 5 minutes easy. |
| **2. The effort** | **20 minutes as hard as you can hold *evenly*.** |
| **3. Cool down** | 10–15 minutes easy spinning. |

**The whole test is in the word "evenly."** This is not a race — a fast start
that fades is the single most common way to get a wrong number, and it reads as
a *lower* threshold than you actually have. Target a pace you believe you could
just barely sustain for the full 20, and expect the last 5 minutes to be
genuinely hard. If you finish with plenty left, the test is invalid; ride it
again another day rather than adjusting the number by feel.

Do not look at heart rate during the effort. Ride by feel and breathing, and
read the number afterwards.

## Reading the result

**LTHR = your average heart rate for the 20-minute effort.**

Some protocols take the average of the final 20 minutes of a longer effort, or
apply a 95% correction to a 20-minute test used as a proxy for a full hour. This
study uses the plain 20-minute average, uncorrected, because the number only has
to be *consistent with itself* across repeats to track progress. Whichever
convention you pick, never change it mid-study — a changed method would show up
as a fitness change.

Enter it in **Settings → Threshold HR**. Zones switch from provisional to
measured immediately.

## What the zones become

Friel's cycling percentages of LTHR. Current best 20 minutes on record is
**152 bpm** (30 Aug, RPE 5 — a moderate ride, so a floor rather than a
threshold):

| zone | | at LTHR 152 | at LTHR 160 | at LTHR 165 |
| --- | --- | --- | --- | --- |
| 1 | Recovery | <123 | <130 | <134 |
| 2 | **Endurance** | **123–137** | **130–144** | **134–149** |
| 3 | Tempo | 137–143 | 144–150 | 149–155 |
| 4 | Threshold | 143–152 | 150–160 | 155–165 |
| 5 | VO2 max | 152+ | 160+ | 165+ |

Holding 152 for 20 minutes at RPE 5 suggests the true threshold is meaningfully
higher — somewhere around 160–165 would not be surprising. If so, the zone-2
ceiling is nearer **145 than 133**, which is a different ride.

## Recording it in the study

Log the test as a ride, named `Threshold Test <date>`, with the 20-minute
average in the notes alongside the conditions. Do **not** mark it excluded — it
is real training load and the fatigue is real.

Because it is a maximal effort, expect HRV to drop the following night and
resting heart rate to rise a beat or two. That is the expected response, not a
warning sign, and it is the same pattern the 16-mile benchmark produced on
23 August. Do not treat that night's HRV as a baseline for anything.

## Repeating it

Every 6–8 weeks, same course, same device, same strap, same time of day where
possible. Record conditions every time.

A rising LTHR at the same weight is one of the cleanest adaptation claims this
study can make — it is a direct measure of the intensity you can sustain, not a
proxy, and it is not distance-sensitive, so it sidesteps the ~4.3% cross-device
distance disagreement documented in `HANDOFF.md`.
