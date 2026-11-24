import { useState } from 'react'
import { battingSide, teamLabel, type Match, type Toss } from './match'

export default function MatchToss({ match, busy, onSave }: {
  match: Match
  busy: boolean
  onSave: (toss: Toss) => void
}) {
  const [winner, setWinner] = useState<Toss['winner'] | ''>('')
  const [decision, setDecision] = useState<Toss['decision'] | ''>('')
  const toss: Toss | null = winner !== '' && decision ? { winner, decision } : null

  return <section>
    <h2>Record the toss</h2>
    <form onSubmit={event => {
      event.preventDefault()
      if (toss && !busy) onSave(toss)
    }}>
      <div className="grid">
        <label>Toss winner<select value={winner} required disabled={busy} onChange={event => {
          const value = event.target.value
          setWinner(value === '' ? '' : value === '0' ? 0 : 1)
        }}>
          <option value="">Choose the winning team</option>
          <option value={0}>{teamLabel(match, 0)}</option>
          <option value={1}>{teamLabel(match, 1)}</option>
        </select></label>
        <label>Elected to<select value={decision} required disabled={busy} onChange={event =>
          setDecision(event.target.value as Toss['decision'] | '')}>
          <option value="">Choose bat or bowl</option>
          <option value="bat">Bat</option>
          <option value="bowl">Bowl</option>
        </select></label>
      </div>
      {toss && <p aria-live="polite"><strong>{teamLabel(match, battingSide({ ...match, toss }, 0))}</strong> will bat first.</p>}
      <button disabled={busy || !toss}>{busy ? 'Saving toss…' : 'Confirm toss and start scoring'}</button>
    </form>
  </section>
}
