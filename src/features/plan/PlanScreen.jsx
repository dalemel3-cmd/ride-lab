import { useState, useMemo, useCallback } from 'react'
import {
  Flag,
  Target,
  Trophy,
  Flame,
  CheckCircle2,
  Circle,
  Zap,
  Bike,
  ExternalLink,
} from 'lucide-react'
import { zoneModel } from '../../data/metrics.js'
import { formatShortDate, toDateString, daysBetween, recordDate, formatDuration } from '../../data/dates.js'
import { ScienceNote } from '../../components/ui.jsx'
import { fireConfetti } from '../../components/confetti.js'

const COMPLETED_STORAGE_KEY = 'ridelab_plan_completed_days'
const RACE_DATE = '2026-10-17'

const PLAN_DAYS = [
  // ==========================================
  // PHASE 1: Load Absorption & Bike Fit (Week 1: Sep 7 - 13)
  // ==========================================
  {
    date: '2026-09-07',
    dayOfWeek: 'Mon',
    weekNum: 1,
    phaseNum: 1,
    phaseName: 'Load Absorption & Fit',
    type: 'rest',
    title: 'Complete Rest & Load Absorption',
    targetDistance: '0 mi',
    targetDuration: '0 min',
    zoneKey: null,
    zoneDesc: 'Full Recovery',
    terrain: 'Off-Bike',
    notes: 'Absorb the 1,344-load Sunday ride. Hydrate, prioritize 8+ hours of sleep, foam roll quads/glutes, and check resting HRV.',
    isMilestone: false,
  },
  {
    date: '2026-09-08',
    dayOfWeek: 'Tue',
    weekNum: 1,
    phaseNum: 1,
    phaseName: 'Load Absorption & Fit',
    type: 'recovery',
    title: 'Easy Recovery Spin',
    targetDistance: '6–8 mi',
    targetDuration: '35 min',
    zoneKey: 1,
    zoneDesc: 'Zone 1 (Recovery)',
    terrain: 'Flat Paved Trail',
    notes: 'Light gear, high cadence (85–95 rpm). Flush metabolic waste from Sunday without adding muscular or cardiac strain.',
    isMilestone: false,
  },
  {
    date: '2026-09-09',
    dayOfWeek: 'Wed',
    weekNum: 1,
    phaseNum: 1,
    phaseName: 'Load Absorption & Fit',
    type: 'endurance',
    title: 'Saddle & Bib Fit Test Ride',
    targetDistance: '8–10 mi',
    targetDuration: '45 min',
    zoneKey: 2,
    zoneDesc: 'Zone 1–2 (Aerobic Base)',
    terrain: 'Paved / Light Gravel',
    notes: 'Sit-bone resolution test: apply chamois cream, test bib shorts, drop saddle nose by 1–2° if experiencing forward pelvis numbness.',
    isMilestone: false,
  },
  {
    date: '2026-09-10',
    dayOfWeek: 'Thu',
    weekNum: 1,
    phaseNum: 1,
    phaseName: 'Load Absorption & Fit',
    type: 'rest',
    title: 'Rest & Mobility Check',
    targetDistance: '0 mi',
    targetDuration: '0 min',
    zoneKey: null,
    zoneDesc: 'Rest / Mobility',
    terrain: 'Off-Bike',
    notes: 'Swapped from Friday: 365lb deadlift at RPE 8.5 plus poor sleep the night before is real systemic fatigue, not just leg soreness — a cardio session on top of that risks a low-quality, HR-inflated ride rather than genuine Zone 2 work. Core stability and hip flexor stretching only. Check crank bolt torque — the left crank has come loose twice this study; check weekly from here, not just race week.',
    isMilestone: false,
  },
  {
    date: '2026-09-11',
    dayOfWeek: 'Fri',
    weekNum: 1,
    phaseNum: 1,
    phaseName: 'Load Absorption & Fit',
    type: 'endurance',
    title: 'Aerobic Foundation & Efficiency',
    targetDistance: '10–12 mi',
    targetDuration: '55 min',
    zoneKey: 2,
    zoneDesc: 'Strict Zone 2',
    terrain: 'Paved / Greenway',
    notes: 'Swapped from Thursday to give the deadlift session and poor sleep a full night to recover from. Keep heart rate strictly capped inside Zone 2 — do not chase the number if the legs or HR say otherwise given yesterday\'s lift. Build stroke volume and mitochondrial density without systemic fatigue.',
    isMilestone: false,
  },
  {
    date: '2026-09-12',
    dayOfWeek: 'Sat',
    weekNum: 1,
    phaseNum: 1,
    phaseName: 'Load Absorption & Fit',
    type: 'endurance',
    title: 'Endurance Gravel & Comfort Check — West Texas Gravel Extravaganza loop',
    targetDistance: '15–18 mi',
    targetDuration: '85 min',
    zoneKey: 2,
    zoneDesc: 'Zone 2 (Z3 on punchy climbs)',
    terrain: 'Rolling Gravel & Pavement (West Texas Gravel Extravaganza loop)',
    notes: 'Ride the West Texas Gravel Extravaganza loop, but only the first 15–18 mi — the full loop is 26.5 mi with 1,590 ft of gain, longer than warranted this week given elevated resting HR and the RPE 8/7 stacked last week. Turn back once the distance target is hit rather than closing the loop. Test saddle comfort past the 1-hour mark. Stay seated on gravel climbs; evaluate tyre grip and tyre pressure (32–36 psi). Save the full loop for a later fueling/pacing rehearsal at closer-to-race distance.',
    isMilestone: false,
  },
  {
    date: '2026-09-13',
    dayOfWeek: 'Sun',
    weekNum: 1,
    phaseNum: 1,
    phaseName: 'Load Absorption & Fit',
    type: 'recovery',
    title: 'Easy Coffee Spin or Rest',
    targetDistance: '6–8 mi',
    targetDuration: '30 min',
    zoneKey: 1,
    zoneDesc: 'Zone 1 (Optional)',
    terrain: 'Flat Paved',
    notes: 'Optional social recovery spin. Keep effort negligible or take complete rest if readiness score is in amber/red.',
    isMilestone: false,
  },

  // ==========================================
  // PHASE 2: Aerobic Calibration & Field Testing (Weeks 2-3: Sep 14 - 27)
  // ==========================================
  {
    date: '2026-09-14',
    dayOfWeek: 'Mon',
    weekNum: 2,
    phaseNum: 2,
    phaseName: 'Aerobic Calibration',
    type: 'rest',
    title: 'Rest & Pre-Test Mental Prep',
    targetDistance: '0 mi',
    targetDuration: '0 min',
    zoneKey: null,
    zoneDesc: 'Full Recovery',
    terrain: 'Off-Bike',
    notes: 'Full rest day. Review the 20-minute LTHR field test protocol for Thursday.',
    isMilestone: false,
  },
  {
    date: '2026-09-15',
    dayOfWeek: 'Tue',
    weekNum: 2,
    phaseNum: 2,
    phaseName: 'Aerobic Calibration',
    type: 'endurance',
    title: 'Zone 2 Base Aerobic',
    targetDistance: '10–12 mi',
    targetDuration: '50 min',
    zoneKey: 2,
    zoneDesc: 'Zone 2 Strict',
    terrain: 'Paved / Road',
    notes: 'Smooth, steady cadence. Keep cardiac cost controlled.',
    isMilestone: false,
  },
  {
    date: '2026-09-16',
    dayOfWeek: 'Wed',
    weekNum: 2,
    phaseNum: 2,
    phaseName: 'Aerobic Calibration',
    type: 'endurance',
    title: 'Easy Spin with Neuromuscular Openers',
    targetDistance: '8 mi',
    targetDuration: '40 min',
    zoneKey: 1,
    zoneDesc: 'Zone 1 + 3 × 30s Openers',
    terrain: 'Paved Flat',
    notes: 'Easy spin with 3 × 30-second cadence pickups (100+ rpm in light gear) to prep nervous system for tomorrow’s time trial.',
    isMilestone: false,
  },
  {
    date: '2026-09-17',
    dayOfWeek: 'Thu',
    weekNum: 2,
    phaseNum: 2,
    phaseName: 'Aerobic Calibration',
    type: 'test',
    title: '20-Minute LTHR Field Test',
    targetDistance: '12–14 mi',
    targetDuration: '50 min',
    zoneKey: 4,
    zoneDesc: 'Zone 4/5 (Max Sustained TT)',
    terrain: 'Uninterrupted Greenway Segment',
    notes: '15m progressive warm-up → 20 min maximal sustained time trial pace → 15m cool down. Average HR of the 20 min interval = your true LTHR. Enter in Settings.',
    isMilestone: true,
    milestoneBadge: '🔥 20-Min LTHR Field Test',
  },
  {
    date: '2026-09-18',
    dayOfWeek: 'Fri',
    weekNum: 2,
    phaseNum: 2,
    phaseName: 'Aerobic Calibration',
    type: 'rest',
    title: 'Post-Test Recovery Day',
    targetDistance: '0 mi',
    targetDuration: '0 min',
    zoneKey: null,
    zoneDesc: 'Full Recovery',
    terrain: 'Off-Bike',
    notes: 'Rest, hydrate, and stretch. Allow sympathetic nervous system to settle following yesterday’s maximal test.',
    isMilestone: false,
  },
  {
    date: '2026-09-19',
    dayOfWeek: 'Sat',
    weekNum: 2,
    phaseNum: 2,
    phaseName: 'Aerobic Calibration',
    type: 'endurance',
    title: 'Rough-Surface Handling Session — Gordon Hollow Donkey Kick (partial)',
    targetDistance: '12–15 mi',
    targetDuration: '80 min',
    zoneKey: 2,
    zoneDesc: 'Zone 2 (Calibrated)',
    terrain: 'Loosest, rockiest surface reachable — not smooth gravel',
    notes: 'Added after review: the real Big Sugar course is rocky Ozark backcountry, not smooth local gravel. This day trades volume for handling practice on the roughest surface you can reach — comfort with the bike moving under you on loose rock matters more here than distance. Ride the first 12–15 mi of Gordon Hollow Donkey Kick (29.3mi full loop, 1,784ft gain) — the hollow terrain is the closest thing in the library to genuine technical ground; turn back once the distance target is hit rather than closing the loop.',
    isMilestone: false,
  },
  {
    date: '2026-09-20',
    dayOfWeek: 'Sun',
    weekNum: 2,
    phaseNum: 2,
    phaseName: 'Aerobic Calibration',
    type: 'rest',
    title: 'Rest & Adaptation',
    targetDistance: '0 mi',
    targetDuration: '0 min',
    zoneKey: null,
    zoneDesc: 'Rest',
    terrain: 'Off-Bike',
    notes: 'Full recovery day. Weekly crank bolt check.',
    isMilestone: false,
  },

  // Week 3 (Phase 2 Continued)
  {
    date: '2026-09-21',
    dayOfWeek: 'Mon',
    weekNum: 3,
    phaseNum: 2,
    phaseName: 'Aerobic Calibration',
    type: 'rest',
    title: 'Rest Day',
    targetDistance: '0 mi',
    targetDuration: '0 min',
    zoneKey: null,
    zoneDesc: 'Full Recovery',
    terrain: 'Off-Bike',
    notes: 'Rest before benchmark week.',
    isMilestone: false,
  },
  {
    date: '2026-09-22',
    dayOfWeek: 'Tue',
    weekNum: 3,
    phaseNum: 2,
    phaseName: 'Aerobic Calibration',
    type: 'endurance',
    title: 'Controlled Zone 2 Spin',
    targetDistance: '8–10 mi',
    targetDuration: '45 min',
    zoneKey: 2,
    zoneDesc: 'Zone 2 Strict',
    terrain: 'Paved Trail',
    notes: 'Keep legs loose and HR capped strictly in lower Zone 2.',
    isMilestone: false,
  },
  {
    date: '2026-09-23',
    dayOfWeek: 'Wed',
    weekNum: 3,
    phaseNum: 2,
    phaseName: 'Aerobic Calibration',
    type: 'benchmark',
    title: '16-Mile Razorback Greenway Repeat',
    targetDistance: '16.0 mi',
    targetDuration: '75 min',
    zoneKey: 2,
    zoneDesc: 'Controlled Zone 2 (128–142 bpm)',
    terrain: 'Razorback Greenway Baseline Course',
    notes: 'Benchmark repeat! Ride the exact baseline course holding 128–142 bpm. Compare speed and beats/mi directly against August 23 baseline.',
    isMilestone: true,
    milestoneBadge: '🎯 16-Mi Benchmark Repeat',
  },
  {
    date: '2026-09-24',
    dayOfWeek: 'Thu',
    weekNum: 3,
    phaseNum: 2,
    phaseName: 'Aerobic Calibration',
    type: 'recovery',
    title: 'Active Recovery Spin',
    targetDistance: '8 mi',
    targetDuration: '40 min',
    zoneKey: 1,
    zoneDesc: 'Zone 1 (<115 bpm)',
    terrain: 'Flat Paved',
    notes: 'Flush legs following the 16-mile benchmark effort.',
    isMilestone: false,
  },
  {
    date: '2026-09-25',
    dayOfWeek: 'Fri',
    weekNum: 3,
    phaseNum: 2,
    phaseName: 'Aerobic Calibration',
    type: 'rest',
    title: 'Rest Day',
    targetDistance: '0 mi',
    targetDuration: '0 min',
    zoneKey: null,
    zoneDesc: 'Full Recovery',
    terrain: 'Off-Bike',
    notes: 'Rest and prepare equipment for Saturday’s 22-mile gravel ride.',
    isMilestone: false,
  },
  {
    date: '2026-09-26',
    dayOfWeek: 'Sat',
    weekNum: 3,
    phaseNum: 2,
    phaseName: 'Aerobic Calibration',
    type: 'endurance',
    title: 'Overdistance Gravel Endurance — Lunch Loop',
    targetDistance: '20–22 mi',
    targetDuration: '1h50',
    zoneKey: 2,
    zoneDesc: 'Zone 2 (Paced)',
    terrain: 'Gravel & Rolling Hills (Lunch Loop, 22.5mi / 1,590ft)',
    notes: 'Fueling rehearsal, not just a distance day: ride with the actual bottles/food you plan to carry on race day, not just any bottle. 40g carbs/hr and 750ml fluid/hr as targets. Note any saddle pressure or fatigue points. Lunch Loop is an exact distance match for this session — ride it in full.',
    isMilestone: false,
  },
  {
    date: '2026-09-27',
    dayOfWeek: 'Sun',
    weekNum: 3,
    phaseNum: 2,
    phaseName: 'Aerobic Calibration',
    type: 'rest',
    title: 'Rest & Recovery',
    targetDistance: '0 mi',
    targetDuration: '0 min',
    zoneKey: null,
    zoneDesc: 'Rest',
    terrain: 'Off-Bike',
    notes: 'Full rest day. Phase 2 complete. Weekly crank bolt check.',
    isMilestone: false,
  },

  // ==========================================
  // PHASE 3: Peak Volume & Race Rehearsal (Week 4: Sep 28 - Oct 4)
  // ==========================================
  {
    date: '2026-09-28',
    dayOfWeek: 'Mon',
    weekNum: 4,
    phaseNum: 3,
    phaseName: 'Peak Volume & Rehearsal',
    type: 'rest',
    title: 'Rest Day',
    targetDistance: '0 mi',
    targetDuration: '0 min',
    zoneKey: null,
    zoneDesc: 'Full Recovery',
    terrain: 'Off-Bike',
    notes: 'Rest day opening peak volume week.',
    isMilestone: false,
  },
  {
    date: '2026-09-29',
    dayOfWeek: 'Tue',
    weekNum: 4,
    phaseNum: 3,
    phaseName: 'Peak Volume & Rehearsal',
    type: 'endurance',
    title: 'Zone 2 with Tempo Climb Surges',
    targetDistance: '12 mi',
    targetDuration: '60 min',
    zoneKey: 3,
    zoneDesc: 'Zone 2 + 4 × 2-min Tempo Surges',
    terrain: 'Rolling Paved & Gravel',
    notes: 'Zone 2 foundation with 4 × 2-minute surges in Zone 3/4 on hills to build climbing resilience.',
    isMilestone: false,
  },
  {
    date: '2026-09-30',
    dayOfWeek: 'Wed',
    weekNum: 4,
    phaseNum: 3,
    phaseName: 'Peak Volume & Rehearsal',
    type: 'endurance',
    title: 'Steady Aerobic Base',
    targetDistance: '10 mi',
    targetDuration: '50 min',
    zoneKey: 2,
    zoneDesc: 'Zone 2 Strict',
    terrain: 'Paved Greenway',
    notes: 'Smooth, relaxed pedal stroke. Focus on posture and shoulder relaxation.',
    isMilestone: false,
  },
  {
    date: '2026-10-01',
    dayOfWeek: 'Thu',
    weekNum: 4,
    phaseNum: 3,
    phaseName: 'Peak Volume & Rehearsal',
    type: 'recovery',
    title: 'Easy Pre-Rehearsal Spin',
    targetDistance: '8 mi',
    targetDuration: '40 min',
    zoneKey: 1,
    zoneDesc: 'Zone 1 (Recovery)',
    terrain: 'Flat Paved',
    notes: 'Short, effortless spin.',
    isMilestone: false,
  },
  {
    date: '2026-10-02',
    dayOfWeek: 'Fri',
    weekNum: 4,
    phaseNum: 3,
    phaseName: 'Peak Volume & Rehearsal',
    type: 'rest',
    title: 'Rest & Race Kit Preparation',
    targetDistance: '0 mi',
    targetDuration: '0 min',
    zoneKey: null,
    zoneDesc: 'Rest',
    terrain: 'Off-Bike',
    notes: 'Rest. Check bike tyres, chain lubrication, and pack carb chews/drink mix for tomorrow’s dress rehearsal. Check bigsugarclassic.com/gravel for a downloadable 25-mile course GPX and load it into Ride with GPS if one exists.',
    isMilestone: false,
  },
  {
    date: '2026-10-03',
    dayOfWeek: 'Sat',
    weekNum: 4,
    phaseNum: 3,
    phaseName: 'Peak Volume & Rehearsal',
    type: 'rehearsal',
    title: 'Full Race Rehearsal: 25–28 Miles — If You Want To See The Graffiti Tunnel',
    targetDistance: '25–28 mi',
    targetDuration: '2h15',
    zoneKey: 2,
    zoneDesc: 'Zone 2 Flats / Zone 4 Climbs',
    terrain: 'Full Gravel Race Course Profile — closest library match is If You Want To See The Graffiti Tunnel (30.2mi / 1,985ft); use the real course GPX instead if it surfaces before this date',
    notes: 'Dress rehearsal: wear exact race bibs, run the exact tyres/pressure planned for race day, eat 45g carbs/hr from minute 30, and cap climb efforts at Zone 4. Never blow up. Any tyre run here for the first time is a red flag, not a rehearsal — only race on rubber that has already completed a ride like this one. If riding Graffiti Tunnel, either trim to 25–28mi or complete the full 30.2mi if legs allow — either way, this is the best distance/terrain proxy in the library right now.',
    isMilestone: true,
    milestoneBadge: '🏆 25–28 Mi Race Rehearsal',
  },
  {
    date: '2026-10-04',
    dayOfWeek: 'Sun',
    weekNum: 4,
    phaseNum: 3,
    phaseName: 'Peak Volume & Rehearsal',
    type: 'recovery',
    title: 'Active Recovery Flush',
    targetDistance: '6–8 mi',
    targetDuration: '35 min',
    zoneKey: 1,
    zoneDesc: 'Zone 1 Recovery',
    terrain: 'Flat Paved',
    notes: 'Gentle spin to flush legs. Peak volume week completed!',
    isMilestone: false,
  },

  // ==========================================
  // PHASE 4: Two-Stage Taper & Race Week (Weeks 5-6: Oct 5 - 18)
  // ==========================================
  {
    date: '2026-10-05',
    dayOfWeek: 'Mon',
    weekNum: 5,
    phaseNum: 4,
    phaseName: 'Two-Stage Taper & Race Week',
    type: 'rest',
    title: 'Rest & Taper Step 1 Start',
    targetDistance: '0 mi',
    targetDuration: '0 min',
    zoneKey: null,
    zoneDesc: 'Full Recovery',
    terrain: 'Off-Bike',
    notes: 'Volume drops by ~35% this week. Allow chronic fatigue (ATL) to plummet while maintaining fitness (CTL).',
    isMilestone: false,
  },
  {
    date: '2026-10-06',
    dayOfWeek: 'Tue',
    weekNum: 5,
    phaseNum: 4,
    phaseName: 'Two-Stage Taper & Race Week',
    type: 'endurance',
    title: 'Zone 2 with 3 × 1-min Race-Pace Openers',
    targetDistance: '10 mi',
    targetDuration: '50 min',
    zoneKey: 2,
    zoneDesc: 'Zone 2 + 3 × 1m Zone 4',
    terrain: 'Paved / Light Gravel',
    notes: '10 miles easy with 3 × 1-minute efforts at race pace (1 min easy rest between). Maintains muscle tension without fatigue.',
    isMilestone: false,
  },
  {
    date: '2026-10-07',
    dayOfWeek: 'Wed',
    weekNum: 5,
    phaseNum: 4,
    phaseName: 'Two-Stage Taper & Race Week',
    type: 'recovery',
    title: 'Easy Aerobic Spin',
    targetDistance: '8 mi',
    targetDuration: '40 min',
    zoneKey: 1,
    zoneDesc: 'Zone 1–2',
    terrain: 'Paved Greenway',
    notes: 'Easy pedal stroke.',
    isMilestone: false,
  },
  {
    date: '2026-10-08',
    dayOfWeek: 'Thu',
    weekNum: 5,
    phaseNum: 4,
    phaseName: 'Two-Stage Taper & Race Week',
    type: 'rest',
    title: 'Mid-Week Taper Rest',
    targetDistance: '0 mi',
    targetDuration: '0 min',
    zoneKey: null,
    zoneDesc: 'Full Recovery',
    terrain: 'Off-Bike',
    notes: 'Rest, hydrate, and stretch.',
    isMilestone: false,
  },
  {
    date: '2026-10-09',
    dayOfWeek: 'Fri',
    weekNum: 5,
    phaseNum: 4,
    phaseName: 'Two-Stage Taper & Race Week',
    type: 'recovery',
    title: 'Short Recovery Spin',
    targetDistance: '6 mi',
    targetDuration: '30 min',
    zoneKey: 1,
    zoneDesc: 'Zone 1',
    terrain: 'Flat Paved',
    notes: 'Keep it light and effortless.',
    isMilestone: false,
  },
  {
    date: '2026-10-10',
    dayOfWeek: 'Sat',
    weekNum: 5,
    phaseNum: 4,
    phaseName: 'Two-Stage Taper & Race Week',
    type: 'endurance',
    title: 'Taper Gravel Ride — 1B Bentonville Trails Intro 18 (partial)',
    targetDistance: '14–16 mi',
    targetDuration: '75 min',
    zoneKey: 2,
    zoneDesc: 'Zone 2 (Relaxed)',
    terrain: 'Gravel & Country Roads (1B - Bentonville Trails Intro 18, trimmed from 17.7mi)',
    notes: 'Crisp 14–16 miles. Practice feeling fast and relaxed on gravel with fresh legs. Ride 1B - Bentonville Trails Intro 18, but turn back a couple miles short of the full 17.7mi loop to land in the 14–16mi target.',
    isMilestone: false,
  },
  {
    date: '2026-10-11',
    dayOfWeek: 'Sun',
    weekNum: 5,
    phaseNum: 4,
    phaseName: 'Two-Stage Taper & Race Week',
    type: 'rest',
    title: 'Rest Day — 6 Days to Race',
    targetDistance: '0 mi',
    targetDuration: '0 min',
    zoneKey: null,
    zoneDesc: 'Rest',
    terrain: 'Off-Bike',
    notes: 'Rest and mental preparation. Weekly crank bolt check.',
    isMilestone: false,
  },

  // Week 6: RACE WEEK
  {
    date: '2026-10-12',
    dayOfWeek: 'Mon',
    weekNum: 6,
    phaseNum: 4,
    phaseName: 'Two-Stage Taper & Race Week',
    type: 'rest',
    title: 'Race Week: Complete Rest',
    targetDistance: '0 mi',
    targetDuration: '0 min',
    zoneKey: null,
    zoneDesc: 'Full Recovery',
    terrain: 'Off-Bike',
    notes: 'Race week begins! Rest completely and focus on deep hydration.',
    isMilestone: false,
  },
  {
    date: '2026-10-13',
    dayOfWeek: 'Tue',
    weekNum: 6,
    phaseNum: 4,
    phaseName: 'Two-Stage Taper & Race Week',
    type: 'endurance',
    title: 'Short Spin with High-Cadence Pickups',
    targetDistance: '8 mi',
    targetDuration: '35 min',
    zoneKey: 1,
    zoneDesc: 'Zone 1 + 3 × 45s High Cadence',
    terrain: 'Flat Paved Trail',
    notes: '8 easy miles with 3 × 45-second high-cadence spins (100 rpm) to keep neuromuscular responsiveness sharp.',
    isMilestone: false,
  },
  {
    date: '2026-10-14',
    dayOfWeek: 'Wed',
    weekNum: 6,
    phaseNum: 4,
    phaseName: 'Two-Stage Taper & Race Week',
    type: 'recovery',
    title: 'Easy Recovery Flush',
    targetDistance: '6 mi',
    targetDuration: '25 min',
    zoneKey: 1,
    zoneDesc: 'Zone 1 Strictly',
    terrain: 'Flat Paved',
    notes: 'Zero effort. Just turning the pedals over.',
    isMilestone: false,
  },
  {
    date: '2026-10-15',
    dayOfWeek: 'Thu',
    weekNum: 6,
    phaseNum: 4,
    phaseName: 'Two-Stage Taper & Race Week',
    type: 'rest',
    title: 'Complete Rest & Final Bike Check',
    targetDistance: '0 mi',
    targetDuration: '0 min',
    zoneKey: null,
    zoneDesc: 'Full Rest & Mechanical Prep',
    terrain: 'Off-Bike',
    notes: 'Check sealant levels, tyre condition, chain lube, and bolt torques — crank bolts specifically, given the history. This is the last realistic day for a shop visit before race day, so don’t wait until tomorrow to find a problem. Rest your legs.',
    isMilestone: false,
  },
  {
    date: '2026-10-16',
    dayOfWeek: 'Fri',
    weekNum: 6,
    phaseNum: 4,
    phaseName: 'Two-Stage Taper & Race Week',
    type: 'endurance',
    title: 'Pre-Race Shakeout (20 min)',
    targetDistance: '4–5 mi',
    targetDuration: '20 min',
    zoneKey: 1,
    zoneDesc: 'Zone 1 + 2 × 30s Race Pace',
    terrain: 'Paved / Trail',
    notes: '20-minute shakeout on whatever tyres are actually racing tomorrow — the last check that the race setup is sound. Ride with the actual race-day food/bottles one more time. Ensure shifting and brakes are dialed. 2 × 30-sec race pace efforts. Pack race bottles, bibs, and shoes.',
    isMilestone: false,
  },
  {
    date: '2026-10-17',
    dayOfWeek: 'Sat',
    weekNum: 6,
    phaseNum: 4,
    phaseName: 'Two-Stage Taper & Race Week',
    type: 'race',
    title: '25-MILE GRAVEL RACE DAY!',
    targetDistance: '25.0 mi',
    targetDuration: 'Race Effort',
    zoneKey: 4,
    zoneDesc: 'Zone 2 Flats / Zone 4 Climbs',
    terrain: '25-Mile Gravel Race Course',
    notes: 'Execute the plan! Strict Zone 2 on flats, cap climbs at Zone 4 threshold, drink every 15 min, eat 45g carbs/hr from min 30. Empty the tank with a controlled finish!',
    isMilestone: true,
    milestoneBadge: '🏁 RACE DAY: 25-MILE GRAVEL',
  },
  {
    date: '2026-10-18',
    dayOfWeek: 'Sun',
    weekNum: 6,
    phaseNum: 4,
    phaseName: 'Two-Stage Taper & Race Week',
    type: 'rest',
    title: 'Post-Race Celebration & Recovery',
    targetDistance: '0 mi',
    targetDuration: '0 min',
    zoneKey: null,
    zoneDesc: 'Celebration & Rest',
    terrain: 'Off-Bike',
    notes: 'You conquered the 25-mile gravel race! Celebrate, rest, and review the four-month physiological adaptations in Progress.',
    isMilestone: true,
    milestoneBadge: '🎉 Race Complete!',
  },
]

export default function PlanScreen({ rides = [], settings = {}, onNavigate }) {
  const [activePhase, setActivePhase] = useState('all') // 'all' | 1 | 2 | 3 | 4
  const [completedDays, setCompletedDays] = useState(() => {
    try {
      const saved = localStorage.getItem(COMPLETED_STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // Which day cards have their notes/matched-ride detail expanded. Cards
  // start collapsed — the meta chips (distance/duration/zone/terrain) stay
  // visible either way, so a two-column desktop grid can show a full week at
  // a glance without every card's full paragraph of notes filling the screen.
  const [openDayIds, setOpenDayIds] = useState(() => new Set())
  const toggleDayOpen = useCallback((dateStr) => {
    setOpenDayIds((prev) => {
      const next = new Set(prev)
      if (next.has(dateStr)) next.delete(dateStr)
      else next.add(dateStr)
      return next
    })
  }, [])

  // Dynamic zone model
  const model = useMemo(() => zoneModel({ rides, settings }), [rides, settings])

  // Today's date in program timezone
  const todayStr = useMemo(() => toDateString(), [])

  // Days until race day
  const daysUntilRace = useMemo(() => daysBetween(todayStr, RACE_DATE), [todayStr])

  // Map rides by date for instant lookup
  const ridesByDate = useMemo(() => {
    const map = new Map()
    for (const r of rides) {
      const d = recordDate(r)
      if (d) {
        if (!map.has(d)) map.set(d, [])
        map.get(d).push(r)
      }
    }
    return map
  }, [rides])

  // Toggle workout completion
  const toggleCompleted = useCallback((dateStr) => {
    setCompletedDays((prev) => {
      const isComplete = prev.includes(dateStr)
      const next = isComplete ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]
      try {
        localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* storage full */
      }
      if (!isComplete) {
        fireConfetti({ particleCount: 45 })
      }
      return next
    })
  }, [])

  // Filtered days based on active phase
  const filteredDays = useMemo(() => {
    if (activePhase === 'all') return PLAN_DAYS
    return PLAN_DAYS.filter((d) => d.phaseNum === activePhase)
  }, [activePhase])

  // Count progress
  const totalWorkouts = PLAN_DAYS.length
  const completedCount = completedDays.length
  const progressPct = Math.min(100, Math.round((completedCount / totalWorkouts) * 100))

  return (
    <div className="screen">
      {/* HEADER */}
      <div className="screen-header">
        <div>
          <h2>Race Training Plan</h2>
          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            25-Mile Gravel Race · Bentonville, AR · Oct 17, 2026
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              borderRadius: 999,
              background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.15) 0%, rgba(8, 145, 178, 0.25) 100%)',
              border: '1px solid var(--color-accent)',
              color: 'var(--color-accent)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}
          >
            <Flag size={14} aria-hidden="true" />
            {daysUntilRace > 0
              ? `${daysUntilRace} Days to Race`
              : daysUntilRace === 0
                ? '🏁 RACE DAY TODAY!'
                : 'Race Completed'}
          </span>
        </div>
      </div>

      {/* HERO RACE TELEMETRY & PROGRESS COCKPIT */}
      <div
        className="card card-glass-glow glow-emerald"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          background: 'linear-gradient(135deg, rgba(16, 38, 64, 0.9) 0%, rgba(6, 18, 32, 0.85) 100%)',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Trophy size={18} color="var(--color-accent)" />
              <span
                style={{
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Race Target: 25.0 Miles Gravel
              </span>
            </div>
            <h3 style={{ fontSize: 'var(--text-xl)', margin: 0, color: 'var(--color-text)' }}>
              6-Week Day-by-Day Progression
            </h3>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-2xl)',
                fontWeight: 700,
                color: 'var(--status-success)',
                lineHeight: 1,
              }}
            >
              {completedCount} / {totalWorkouts}
            </span>
            <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>
              Workouts Checked ({progressPct}%)
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: 10,
            borderRadius: 999,
            background: 'rgba(255, 255, 255, 0.08)',
            overflow: 'hidden',
            border: '1px solid var(--color-border)',
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--color-accent) 0%, var(--status-success) 100%)',
              transition: 'width 0.4s ease',
            }}
          />
        </div>

        {/* Dynamic Zone Model Banner */}
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(6, 15, 26, 0.75)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={16} color="var(--color-accent)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Active Zone Anchor:{' '}
              <strong style={{ color: 'var(--color-text)' }}>
                {model.anchor === 'lthr'
                  ? model.provisional
                    ? `Observed LTHR Floor (${model.value} bpm)`
                    : `Tested LTHR (${model.value} bpm)`
                  : `Estimated Max HR (${model.value} bpm)`}
              </strong>
            </span>
          </div>
          {model.ranges[1] && (
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                color: 'var(--zone-2)',
                background: 'rgba(52, 211, 153, 0.12)',
                padding: '2px 8px',
                borderRadius: 999,
                border: '1px solid rgba(52, 211, 153, 0.3)',
              }}
            >
              Z2 Target: {model.ranges[1].lowBpm}–{model.ranges[1].highBpm} bpm
            </span>
          )}
        </div>
      </div>

      {/* PHASE FILTER CHIPS */}
      <div className="filter-chips">
        <button
          type="button"
          className={`filter-chip ${activePhase === 'all' ? 'active' : ''}`}
          onClick={() => setActivePhase('all')}
        >
          Full 6 Weeks (All)
        </button>
        <button
          type="button"
          className={`filter-chip ${activePhase === 1 ? 'active' : ''}`}
          onClick={() => setActivePhase(1)}
        >
          Phase 1: Absorption & Fit (W1)
        </button>
        <button
          type="button"
          className={`filter-chip ${activePhase === 2 ? 'active' : ''}`}
          onClick={() => setActivePhase(2)}
        >
          Phase 2: LTHR & Benchmark (W2–3)
        </button>
        <button
          type="button"
          className={`filter-chip ${activePhase === 3 ? 'active' : ''}`}
          onClick={() => setActivePhase(3)}
        >
          Phase 3: Peak & Rehearsal (W4)
        </button>
        <button
          type="button"
          className={`filter-chip ${activePhase === 4 ? 'active' : ''}`}
          onClick={() => setActivePhase(4)}
        >
          Phase 4: Taper & Race (W5–6)
        </button>
      </div>

      {/* 3 QUICK-ACCESS PROTOCOL & STRATEGY TILES */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
          gap: 12,
        }}
      >
        {/* TILE 1: 20-Minute LTHR Protocol */}
        <div
          className="card"
          style={{
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            borderLeft: '3px solid var(--zone-4)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                color: 'var(--zone-4)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Week 2 Protocol (Thu Sep 17)
            </span>
            <Flame size={16} color="var(--zone-4)" />
          </div>
          <strong style={{ fontSize: 'var(--text-sm)' }}>20-Min LTHR Field Test</strong>
          <span className="muted" style={{ fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>
            15m warm-up → 20m all-out time-trial pace → 15m cool down. Average HR of the 20m effort locks in your tested threshold.
          </span>
          <button
            className="btn"
            style={{
              alignSelf: 'flex-start',
              padding: '8px 14px',
              fontSize: 'var(--text-xs)',
              minHeight: 'var(--tap-target)',
              marginTop: 4,
              display: 'inline-flex',
              alignItems: 'center',
            }}
            onClick={() => onNavigate('settings')}
          >
            Enter LTHR in Settings <ExternalLink size={14} style={{ marginLeft: 6 }} />
          </button>
        </div>

        {/* TILE 2: 16-Mile Benchmark Repeat */}
        <div
          className="card"
          style={{
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            borderLeft: '3px solid var(--color-accent)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                color: 'var(--color-accent)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Week 3 Protocol (Wed Sep 23)
            </span>
            <Target size={16} color="var(--color-accent)" />
          </div>
          <strong style={{ fontSize: 'var(--text-sm)' }}>16-Mi Greenway Benchmark</strong>
          <span className="muted" style={{ fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>
            Re-ride the August 23 baseline course holding 128–142 bpm. Direct 4-week adaptation check on speed and beats/mi.
          </span>
          <button
            className="btn"
            style={{
              alignSelf: 'flex-start',
              padding: '8px 14px',
              fontSize: 'var(--text-xs)',
              minHeight: 'var(--tap-target)',
              marginTop: 4,
              display: 'inline-flex',
              alignItems: 'center',
            }}
            onClick={() => onNavigate('repeats')}
          >
            View Route Comparison <ExternalLink size={14} style={{ marginLeft: 6 }} />
          </button>
        </div>

        {/* TILE 3: Race Pacing & Fueling Rules */}
        <div
          className="card"
          style={{
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            borderLeft: '3px solid var(--status-success)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                color: 'var(--status-success)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Race Day Directives
            </span>
            <Flag size={16} color="var(--status-success)" />
          </div>
          <strong style={{ fontSize: 'var(--text-sm)' }}>Pacing & 45g/hr Fueling</strong>
          <span className="muted" style={{ fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>
            Strict Zone 2 on gravel flats; cap climbs at Zone 4 threshold. Drink 500–750ml/hr with electrolytes. Eat 30–50g carbs/hr from min 30.
          </span>
        </div>
      </div>

      {/* DAY-BY-DAY WORKOUT SCHEDULE LIST */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ fontSize: 'var(--text-lg)' }}>
            {activePhase === 'all'
              ? 'Complete 42-Day Training Calendar'
              : `Phase ${activePhase} Workouts`}
          </h3>
          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            Tap a card to expand notes · tap the checkbox to check off completed days
          </span>
        </div>

        <div className="plan-day-grid">
        {filteredDays.map((day) => {
          const isDone = completedDays.includes(day.date)
          const isToday = day.date === todayStr
          const isOpen = openDayIds.has(day.date)
          const matchedRides = ridesByDate.get(day.date) ?? []
          const hasMatchedRide = matchedRides.length > 0

          // Resolve dynamic zone BPM for this day's intensity
          let targetBpmLabel = null
          if (day.zoneKey != null && model.ranges[day.zoneKey - 1]) {
            const z = model.ranges[day.zoneKey - 1]
            targetBpmLabel = `${z.lowBpm}–${z.highBpm} bpm`
          }

          return (
            <article
              key={day.date}
              className={`card ${
                day.isMilestone
                  ? 'card-glass-glow glow-amber'
                  : isToday
                    ? 'card-glass-glow glow-emerald'
                    : ''
              }`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: '14px 16px',
                borderLeft: isDone
                  ? '4px solid var(--status-success)'
                  : day.isMilestone
                    ? '4px solid var(--zone-4)'
                    : isToday
                      ? '4px solid var(--color-accent)'
                      : '4px solid var(--color-border)',
                opacity: isDone ? 0.85 : 1,
                background: isDone
                  ? 'linear-gradient(135deg, rgba(10, 30, 24, 0.7) 0%, rgba(6, 15, 26, 0.7) 100%)'
                  : undefined,
                cursor: 'pointer',
              }}
              onClick={() => toggleDayOpen(day.date)}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleDayOpen(day.date)
                }
              }}
            >
              {/* Card Header: Date + Milestone Badge + Checkbox */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)' }}>
                      {day.dayOfWeek} · {formatShortDate(day.date)}
                    </strong>
                    {isToday && (
                      <span
                        style={{
                          background: 'var(--color-accent)',
                          color: '#060f1a',
                          padding: '1px 8px',
                          borderRadius: 999,
                          fontSize: '10px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                        }}
                      >
                        Today
                      </span>
                    )}
                    <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                      W{day.weekNum} · Phase {day.phaseNum}
                    </span>
                  </div>

                  {day.milestoneBadge && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        color: 'var(--zone-4)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 700,
                        marginTop: 2,
                      }}
                    >
                      {day.milestoneBadge}
                    </span>
                  )}
                </div>

                {/* 44px Touch Target Checkbox */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleCompleted(day.date)
                  }}
                  aria-label={isDone ? `Mark ${day.date} incomplete` : `Mark ${day.date} completed`}
                  style={{
                    minWidth: 'var(--tap-target)',
                    minHeight: 'var(--tap-target)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: isDone ? 'var(--status-success)' : 'var(--color-text-muted)',
                    padding: 0,
                  }}
                >
                  {isDone ? (
                    <CheckCircle2 size={24} color="var(--status-success)" />
                  ) : (
                    <Circle size={24} color="var(--color-text-muted)" />
                  )}
                </button>
              </div>

              {/* Title & Workout Specs */}
              <div>
                <h4 style={{ margin: '0 0 6px', fontSize: 'var(--text-base)', color: 'var(--color-text)' }}>
                  {day.title}
                </h4>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  <span>
                    Distance: <strong style={{ color: 'var(--color-text)' }}>{day.targetDistance}</strong>
                  </span>
                  <span>
                    Duration: <strong style={{ color: 'var(--color-text)' }}>{day.targetDuration}</strong>
                  </span>
                  <span>
                    Intensity:{' '}
                    <strong style={{ color: day.zoneKey ? `var(--zone-${day.zoneKey})` : 'var(--color-text)' }}>
                      {day.zoneDesc} {targetBpmLabel ? `(${targetBpmLabel})` : ''}
                    </strong>
                  </span>
                  <span>
                    Terrain: <strong style={{ color: 'var(--color-text)' }}>{day.terrain}</strong>
                  </span>
                </div>
              </div>

              {!isOpen && (
                <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                  {hasMatchedRide ? '✓ logged · ' : ''}Tap for notes
                </span>
              )}

              {isOpen && (
                <>
                  {/* Notes */}
                  <p
                    style={{
                      margin: 0,
                      fontSize: 'var(--text-xs)',
                      lineHeight: 1.5,
                      color: 'var(--color-text-muted)',
                      borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                      paddingTop: 8,
                    }}
                  >
                    {day.notes}
                  </p>

                  {/* Auto-Matched Ride in Log */}
                  {hasMatchedRide && (
                    <div
                      style={{
                        marginTop: 4,
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(34, 211, 238, 0.08)',
                        border: '1px solid rgba(34, 211, 238, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)' }}>
                        <Bike size={14} color="var(--color-accent)" />
                        <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
                          Logged Activity:
                        </span>
                        <span style={{ color: 'var(--color-text)' }}>
                          {matchedRides[0].route_name || 'Ride'} · {matchedRides[0].distance_mi ?? '—'} mi ·{' '}
                          {formatDuration(matchedRides[0].duration_min)}
                          {matchedRides[0].avg_hr ? ` · avg ${matchedRides[0].avg_hr} bpm` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '8px 12px', fontSize: 'var(--text-xs)', minHeight: 'var(--tap-target)' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onNavigate('rides')
                        }}
                      >
                        View in Rides
                      </button>
                    </div>
                  )}
                </>
              )}
            </article>
          )
        })}
        </div>
      </section>

      {/* SCIENCE NOTE */}
      <ScienceNote title="The Physiology of 25-Mile Gravel Adaptation">
        Covering 25 miles on gravel requires sustained aerobic power without depleting liver and muscle glycogen. 
        By strictly capping flat-gravel riding in <strong>Zone 2</strong> (fat oxidation peak), you spare carbohydrates for punchy climbs 
        and prevent the late-race systemic cardiac drift that caused fatigue on previous long efforts. 
        The two-stage taper in Weeks 5–6 allows <strong>acute fatigue (ATL)</strong> to dissipate while <strong>chronic fitness (CTL)</strong> 
        remains stable, delivering positive <strong>Training Stress Balance (TSB)</strong> on October 17.
      </ScienceNote>
    </div>
  )
}
