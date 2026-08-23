/**
 * What each headline metric is, and why this study leans on it.
 *
 * The app already explains individual charts where they sit. This is the
 * reference version: one place that says what a number measures, how Ride Lab
 * computes it, what counts as a real change rather than noise, and which paper
 * it comes from — so the case study can be checked by someone who did not build
 * it, and so the rider is not taking a dashboard's word for anything.
 *
 * Collapsed by default. A wall of physiology is the right thing to have and the
 * wrong thing to scroll past on a phone every time you open Settings.
 */

const METRICS = [
  {
    id: 'cardiac-cost',
    name: 'Cardiac cost',
    unit: 'beats per mile',
    summary: 'How many heartbeats a mile costs you. The headline number of the whole study.',
    what:
      'Total heartbeats spent covering one mile: average heart rate × ride duration ÷ distance. A 60-minute ride at 150 bpm spends 9,000 beats; over 15 miles that is 600 beats per mile.',
    computed:
      'Ride Lab needs average heart rate, duration and distance on the same ride. Rides are compared only against others on the same surface — never pooled — because gravel and singletrack cost far more per mile than pavement at identical fitness, and mixing them makes terrain look like fitness.',
    why:
      'The question this study exists to answer is whether the same work is costing your body less. Speed alone cannot answer it: wind, terrain, traffic lights and how hard you felt like riding all move it. Heart rate alone cannot either, because you choose how hard to go. Beats per mile combines the two — distance covered against the physiological price of covering it.',
    real:
      'Judge it over four or more rides on one surface. A single ride swinging 5–10% is heat, sleep, hydration or a headwind. A downward drift sustained across weeks is stroke volume rising and your aerobic system doing more per beat.',
    caveat:
      'This is a plain-language cousin of two published indices rather than one of them: Efficiency Factor (normalised power ÷ heart rate) and aerobic decoupling, both of which need a power meter. Without one, beats per mile is the closest honest substitute — it is directionally the same measurement, and it is not a validated laboratory index.',
    source: 'Allen, H. & Coggan, A. — Training and Racing with a Power Meter (efficiency factor, aerobic decoupling)',
  },
  {
    id: 'resting-hr',
    name: 'Resting heart rate',
    unit: 'bpm',
    summary: 'The cheapest honest long-run marker of aerobic adaptation there is.',
    what:
      'Your heart rate at complete rest, measured overnight by the wrist device rather than by sitting still and hoping.',
    computed:
      'Read from Google Health as `daily-resting-heart-rate`, one value per day. It also feeds the VO₂ max estimate and the daily readiness score.',
    why:
      'Endurance training enlarges the left ventricle and raises stroke volume — the heart moves more blood per contraction. Needing fewer beats to idle is that adaptation showing up in a number you can take every morning for free. It is the one metric here that reflects changes you feel off the bike as much as on it.',
    real:
      'A drift of 3–7 bpm downward across months is genuine adaptation. Day-to-day movement of 2–3 bpm is noise. A rise of 5 bpm or more over a few days — especially alongside falling HRV — points at fatigue, poor sleep, alcohol or illness, not at losing fitness.',
    source:
      'Uth, N., Sørensen, H., Overgaard, K. & Pedersen, P. K. (2004). Estimation of VO2max from the ratio between HRmax and HRrest — the Heart Rate Ratio Method. European Journal of Applied Physiology, 91(1), 111–115.',
  },
  {
    id: 'hrv',
    name: 'HRV (rMSSD)',
    unit: 'ms',
    summary: 'How much your nervous system is still braking the heart — the recovery signal.',
    what:
      'Root mean square of successive differences: the average variation between consecutive heartbeats, in milliseconds. It tracks vagal (parasympathetic) activity — the "rest and digest" brake on heart rate. Higher generally means better recovered.',
    computed:
      'Nightly rMSSD from Google Health. Ride Lab log-transforms it, takes a 7-day rolling mean, and draws bands at ± 0.5 standard deviations — the smallest worthwhile change. A reading below the band reads as sympathetic stress; above it as parasympathetic dominance. No verdict is given until seven readings exist, because with fewer the bands are narrower than ordinary night-to-night variation and every reading trips an alarm.',
    why:
      'Training load and recovery are the two halves of adaptation, and this app can measure the load precisely while the recovery half is mostly invisible. HRV is the closest thing to a direct read on whether your body has absorbed the training or is still paying for it.',
    real:
      'Never compare your number to anyone else\'s — rMSSD is highly individual, and a healthy adult range spans roughly 20–200 ms. Only your own rolling baseline means anything. A multi-day decline alongside a rising resting heart rate is the pattern worth acting on; one low night after a late meal or a beer is not.',
    source:
      'Plews, D. J., Laursen, P. B., Stanley, J., Kilding, A. E. & Buchheit, M. (2013). Training adaptation and heart rate variability in elite endurance athletes: opening the door to effective monitoring. Sports Medicine, 43(9), 773–781. doi:10.1007/s40279-013-0071-8',
  },
  {
    id: 'ctl',
    name: 'Fitness (CTL)',
    unit: 'training load units',
    summary: 'A rolling average of how much training you have absorbed. Slow by design.',
    what:
      'Chronic Training Load: a 42-day exponentially weighted average of daily training load. Its short-term counterpart, ATL, uses 7 days. Form (TSB) is CTL minus ATL — fitness you have banked, minus fatigue you are still carrying.',
    computed:
      'Daily load comes from session RPE (your 1–10 rating × ride minutes) or from TRIMP where continuous heart rate exists. Ride Lab builds the full daily series and reports the latest values.',
    why:
      'It separates two things riders constantly confuse: being fit and being fresh. A hard block drives CTL up and TSB down — you are fitter and more tired at once. Reading either number alone leads you to rest when you should build, or build when you should rest.',
    real:
      'CTL needs roughly six weeks before it means anything, because the 42-day window starts mostly full of days you were not riding. Early in a study it climbs on its own as the window fills, which is arithmetic rather than progress — Ride Lab marks it provisional until then. Sustainable growth is a few points per week.',
    source:
      'Banister, E. W. (1991). Modeling elite athletic performance. In MacDougall, Wenger & Green (eds), Physiological Testing of Elite Athletes. Foster, C. (1998). Monitoring training in athletes with reference to overtraining syndrome. Medicine & Science in Sports & Exercise, 30(7), 1164–1168.',
  },
]

const FURTHER_READING = [
  {
    label: 'Max heart rate (Tanaka formula)',
    cite: 'Tanaka, H., Monahan, K. D. & Seals, D. R. (2001). Age-predicted maximal heart rate revisited. Journal of the American College of Cardiology, 37(1), 153–156.',
  },
  {
    label: 'Polarized 80/20 intensity distribution',
    cite: 'Seiler, S. (2010). What is best practice for training intensity and duration distribution in endurance athletes? International Journal of Sports Physiology and Performance, 5(3), 276–291.',
  },
  {
    label: 'Acute:chronic workload ratio',
    cite: 'Gabbett, T. J. (2016). The training—injury prevention paradox: should athletes be training smarter and harder? British Journal of Sports Medicine, 50(5), 273–280.',
  },
  {
    label: 'Training monotony and strain',
    cite: 'Foster, C. (1998). Monitoring training in athletes with reference to overtraining syndrome. Medicine & Science in Sports & Exercise, 30(7), 1164–1168.',
  },
]

function Field({ label, children }) {
  return (
    <div style={{ marginTop: 10 }}>
      <strong
        style={{
          display: 'block',
          marginBottom: 2,
          color: 'var(--color-accent)',
          fontSize: 'var(--text-xs)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </strong>
      <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.55 }}>
        {children}
      </span>
    </div>
  )
}

/**
 * Native disclosure rather than React state: it keeps working with JavaScript
 * busy, it is what a screen reader already understands, and the browser's own
 * find-in-page can open it.
 */
function Entry({ metric }) {
  return (
    <details
      style={{
        borderTop: '1px solid var(--color-border)',
        padding: '10px 0 4px',
      }}
    >
      <summary style={{ cursor: 'pointer', listStyle: 'revert' }}>
        <span style={{ fontWeight: 600 }}>{metric.name}</span>{' '}
        <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>({metric.unit})</span>
        <span
          style={{
            display: 'block',
            color: 'var(--color-text-muted)',
            fontSize: 'var(--text-sm)',
            lineHeight: 1.45,
            marginTop: 2,
          }}
        >
          {metric.summary}
        </span>
      </summary>

      <Field label="What it measures">{metric.what}</Field>
      <Field label="How Ride Lab computes it">{metric.computed}</Field>
      <Field label="Why this study uses it">{metric.why}</Field>
      <Field label="What counts as a real change">{metric.real}</Field>
      {/* Only where the metric is not what it might be mistaken for. Stating a
          limitation next to the number is what makes the rest trustworthy. */}
      {metric.caveat && <Field label="What it is not">{metric.caveat}</Field>}
      <Field label="Source">{metric.source}</Field>
    </details>
  )
}

export default function MetricGuide() {
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <h3 style={{ fontSize: 'var(--text-base)', margin: 0 }}>Metrics &amp; method</h3>
      <p className="muted" style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
        What the headline numbers on Progress actually measure, how they are calculated here, and
        where the method comes from. Tap any one to open it.
      </p>

      {METRICS.map((metric) => (
        <Entry key={metric.id} metric={metric} />
      ))}

      <details style={{ borderTop: '1px solid var(--color-border)', padding: '10px 0 4px' }}>
        <summary style={{ cursor: 'pointer', listStyle: 'revert' }}>
          <span style={{ fontWeight: 600 }}>Other models used in this app</span>
        </summary>
        <ul
          style={{
            margin: '10px 0 0',
            paddingLeft: 18,
            color: 'var(--color-text-muted)',
            fontSize: 'var(--text-sm)',
            lineHeight: 1.55,
          }}
        >
          {FURTHER_READING.map((item) => (
            <li key={item.label} style={{ marginBottom: 8 }}>
              <strong style={{ color: 'var(--color-text)' }}>{item.label}</strong>
              <br />
              {item.cite}
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
