import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type CreditSummary = {
  score: number
  on_time_returns: number
  overdue_loans: number
  completed_lends: number
}

const gaugeArc = 'M 88.7 231.3 A 115 115 0 1 1 251.3 231.3'
const gaugeLength = 115 * Math.PI * 1.5
const ticks = [0, 25, 50, 75, 100]

function tickPosition(value: number) {
  const angle = (135 + value * 2.7) * Math.PI / 180
  return { x: 170 + 83 * Math.cos(angle), y: 150 + 83 * Math.sin(angle) }
}

export function CreditScore({ client, studentId }: { client: SupabaseClient; studentId: string }) {
  const [credit, setCredit] = useState<CreditSummary | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    async function loadCredit() {
      const { data, error: loadError } = await client.rpc('get_credit_summary')
      if (!active) return
      if (loadError || !Array.isArray(data) || !data[0]) {
        setError(true)
      } else {
        setCredit(data[0])
        setError(false)
      }
    }
    void loadCredit().catch(() => { if (active) setError(true) })
    const timer = window.setInterval(() => { void loadCredit().catch(() => { if (active) setError(true) }) }, 60_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [client, studentId])

  const score = Math.max(0, Math.min(100, credit?.score ?? 0))
  const needleAngle = (135 + (credit ? score : 50) * 2.7) * Math.PI / 180
  const needleTip = { x: 170 + 72 * Math.cos(needleAngle), y: 150 + 72 * Math.sin(needleAngle) }

  return <section className="student-panel credit-panel" aria-label="BorrowBuddy credit score">
    <div className="credit-gauge-card">
      <p className="student-eyebrow">BorrowBuddy credit</p>
      <svg className="credit-gauge" viewBox="0 0 340 275" role="img"
        aria-label={credit ? `Credit score ${score} out of 100` : error ? 'Credit score unavailable' : 'Credit score loading'}>
        <defs>
          <linearGradient id="credit-arc-gradient" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#02b4f6" />
            <stop offset="55%" stopColor="#35d8e7" />
            <stop offset="100%" stopColor="#6bf4da" />
          </linearGradient>
          <linearGradient id="credit-needle-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#31435b" />
            <stop offset="100%" stopColor="#73849a" />
          </linearGradient>
        </defs>
        <path d={gaugeArc} className="credit-gauge-track" />
        {credit && <path d={gaugeArc} className="credit-gauge-progress"
          strokeDasharray={`${gaugeLength * score / 100} ${gaugeLength}`} />}
        {ticks.map((tick) => {
          const point = tickPosition(tick)
          return <text key={tick} x={point.x} y={point.y} className="credit-gauge-tick"
            textAnchor="middle" dominantBaseline="middle">{tick}</text>
        })}
        <g className={credit ? undefined : 'credit-gauge-unavailable'}>
          <line x1="170" y1="150" x2={needleTip.x} y2={needleTip.y} className="credit-gauge-needle" />
          <circle cx="170" cy="150" r="6" className="credit-gauge-pivot" />
        </g>
        <text x="170" y="211" className="credit-gauge-value" textAnchor="middle">
          {credit ? score : '—'}<tspan className="credit-gauge-total"> / 100</tspan>
        </text>
      </svg>
      <p className="credit-gauge-caption">{credit ? 'Your credit score' : error ? 'Score unavailable' : 'Loading your score'}</p>
    </div>
    {error && <p className="form-error" role="alert">Couldn’t load your credit score. Try opening this page again.</p>}
    <p>Return borrowed items by the agreed deadline to build your score. Lending items to other students helps it recover faster.</p>
    {credit && <dl>
      <div><dt>On-time returns</dt><dd>{credit.on_time_returns}</dd></div>
      <div><dt>Overdue loans</dt><dd>{credit.overdue_loans}</dd></div>
      <div><dt>Completed lends</dt><dd>{credit.completed_lends}</dd></div>
    </dl>}
    <p className="student-muted">Start at 80 · 20 points off per overdue loan · 5 points per on-time return · 10 points per completed lend</p>
  </section>
}

export function CreditScorePage({ client, studentId }: { client: SupabaseClient; studentId: string }) {
  return <>
    <div className="student-page-heading">
      <p className="student-eyebrow">Your activity</p>
      <h1>My Credit Score</h1>
      <p>See how borrowing and lending affect your BorrowBuddy score.</p>
    </div>
    <CreditScore client={client} studentId={studentId} />
  </>
}
