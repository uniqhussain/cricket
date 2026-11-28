import { useMemo, useState } from 'react'
import { battingSide, oppositeSide, overCards, teamLabel, type Match, type ScoreOperation } from './match'
import DismissalFields, { readDismissal } from './dismissal-fields'
import type { Delivery } from './scoring'

function deliveryChip(ball: Delivery) {
  if (ball.groundRun) return { tone: 'ground', text: '1G', label: 'One run without changing strike' }
  if (ball.dismissed) return {
    tone: 'wicket', text: ball.batRuns ? 'W+' + ball.batRuns : 'W',
    label: ball.dismissed + (ball.dismissal?.kind === 'bowled' ? ' bowled · ' + ball.bowler : ' out')
      + (ball.dismissal && 'fielder' in ball.dismissal ? ' · ' + ball.dismissal.kind + ' · ' + ball.dismissal.fielder : '')
      + (ball.batRuns ? ', ' + ball.batRuns + ' runs' : ''),
  }
  if (ball.kind === 'wide') {
    const runs = ball.physicalRuns + 1
    return { tone: 'extra', text: runs === 1 ? 'Wd' : runs + 'Wd', label: runs + (runs === 1 ? ' wide run' : ' wide runs') }
  }
  if (ball.kind === 'no-ball') return {
    tone: 'extra', text: ball.batRuns ? 'Nb+' + ball.batRuns : 'Nb',
    label: ball.batRuns ? 'No-ball, ' + ball.batRuns + ' runs off the bat' : 'No-ball',
  }
  if (ball.boundary) return { tone: ball.boundary === 6 ? 'six' : 'four', text: String(ball.boundary), label: 'Boundary ' + ball.boundary }
  return { tone: ball.batRuns ? 'runs' : 'dot', text: String(ball.batRuns), label: ball.batRuns ? ball.batRuns + ' runs' : 'Dot ball' }
}

type Correction = Extract<ScoreOperation, { operation: 'correct' }>

function CorrectDelivery({ ball, batters, fielders, busy, onSave }: {
  ball: Delivery
  batters: string[]
  fielders: string[]
  busy: boolean
  onSave: (ball: Delivery) => void
}) {
  const [dismissed, setDismissed] = useState(ball.dismissed ?? '')
  return <form onSubmit={event => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const runs = Number(form.get('runs'))
    const runType = form.get('runType')
    const groundRun = runType === '1G'
    const boundary = runType === '4' ? 4 : runType === '6' ? 6 : undefined
    onSave({
      ...ball, batRuns: groundRun ? 1 : ball.kind === 'wide' ? 0 : boundary ?? runs,
      physicalRuns: groundRun || boundary ? 0 : runs, boundary, groundRun: groundRun ? true : undefined,
      dismissed: dismissed || undefined,
      dismissal: dismissed ? readDismissal(form) : undefined,
    })
  }}>
    <label>Runs completed<input type="number" name="runs" min={0} max={100} defaultValue={ball.physicalRuns} required /></label>
    {ball.kind !== 'wide' && <label>Run type<select name="runType" defaultValue={ball.groundRun ? '1G' : ball.boundary ?? 0}>
      <option value={0}>Runs completed</option><option value={4}>Four</option><option value={6}>Six</option>
      {ball.kind === 'legal' && <option value="1G">1G · One run without changing strike</option>}
    </select></label>}
    {ball.kind === 'legal' && <label>Dismissed batter<select name="dismissed" value={dismissed} onChange={event => setDismissed(event.target.value)}>
      <option value="">None</option>
      {batters.map(batter => <option key={batter}>{batter}</option>)}
    </select></label>}
    {dismissed && <DismissalFields fielders={fielders} initial={ball.dismissal} legacy />}
    <button disabled={busy}>Save correction</button>
  </form>
}

export default function OverTimeline({ match, currentComplete, revision, busy, onCorrect }: {
  match: Match
  currentComplete: boolean
  revision?: number
  busy: boolean
  onCorrect?: (action: Correction) => void
}) {
  const [viewedInnings, setViewedInnings] = useState<0 | 1 | null>(null)
  const innings = viewedInnings ?? match.innings
  const cards = useMemo(() => overCards(match, innings).reverse(), [match, innings])
  const battingTeam = teamLabel(match, battingSide(match, innings))
  return <section aria-label="Over-by-over scoring" className="over-timeline">
    <h2>Over by over</h2>
    {match.innings === 1 && <nav className="actions over-innings-nav" aria-label="Score by innings">
      {([0, 1] as const).map(index => <button key={index} type="button" aria-pressed={innings === index}
        onClick={() => setViewedInnings(index)}>
        {index === 0 ? '1st' : '2nd'} · {teamLabel(match, battingSide(match, index))}
      </button>)}
    </nav>}
    {!cards.length ? <p className="muted">No deliveries recorded for {battingTeam} yet.</p> : <>
      <ul className="over-key" aria-label="Delivery symbols">
        <li><span className="delivery-chip delivery-dot">0</span> Dot</li>
        <li><span className="delivery-chip delivery-ground">1G</span> One run, same striker</li>
        <li><span className="delivery-chip delivery-four">4</span> Four</li>
        <li><span className="delivery-chip delivery-six">6</span> Six</li>
        <li><span className="delivery-chip delivery-wicket">W</span> Wicket</li>
        <li><span className="delivery-chip delivery-extra">Wd</span> Wide</li>
        <li><span className="delivery-chip delivery-extra">Nb</span> No-ball</li>
      </ul>
      <div className="over-cards">
        {cards.map(over => {
          const inPlay = !over.locked && innings === match.innings && !currentComplete && !match.stoppedAt
          return <article className={'over-card' + (inPlay ? ' over-in-play' : '')} key={innings + ':' + over.over_number}>
            <div className="over-card-heading">
              <div><h3>Over {over.over_number}</h3><span className="muted">{over.score.deliveries[0].bowler}</span></div>
              <div className="over-card-total">
                <strong>{over.score.runs} {over.score.runs === 1 ? 'run' : 'runs'} · {over.score.wickets} {over.score.wickets === 1 ? 'wicket' : 'wickets'}</strong>
                <span className="muted">{battingTeam} {over.inningsRuns}/{over.inningsWickets}</span>
              </div>
            </div>
            <ol className="over-deliveries" aria-label={'Over ' + over.over_number + ' deliveries'}>
              {over.score.deliveries.map((ball, index) => {
                const chip = deliveryChip(ball)
                return <li key={index} title={chip.label}>
                  <span className={'delivery-chip delivery-' + chip.tone} aria-hidden="true">{chip.text}</span>
                  <span className="delivery-description">{chip.label}</span>
                </li>
              })}
            </ol>
            <p className="muted over-caption">{over.locked ? 'Locked · 6 legal balls'
              : (inPlay ? 'In progress · ' : 'Partial over · ') + over.legalBalls + '/6 legal balls'}</p>
            {over.locked && onCorrect && <details>
              <summary>Admin corrections</summary>
              <ol>{over.score.deliveries.map((ball, index) => <li key={index}>
                <details><summary>Delivery {index + 1} · {deliveryChip(ball).label}</summary>
                  <CorrectDelivery key={revision} ball={ball} batters={match.sides[battingSide(match, innings)]}
                    fielders={match.sides[oppositeSide(battingSide(match, innings))]} busy={busy}
                    onSave={corrected => onCorrect({ operation: 'correct', innings, index: over.start + index, ball: corrected })} />
                </details>
              </li>)}</ol>
            </details>}
          </article>
        })}
      </div>
    </>}
  </section>
}
