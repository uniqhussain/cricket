import { useState } from 'react'
import type { BattingPair } from './scoring'

export default function BattingPairPicker({ candidates, survivor, retired, busy, onSave }: {
  candidates: string[]
  survivor?: string
  retired: string[]
  busy: boolean
  onSave: (pair: BattingPair) => void
}) {
  const [striker, setStriker] = useState('')
  const [partner, setPartner] = useState('')
  const batterLabel = (name: string) => retired.includes(name) ? name + ' (retired hurt)' : name

  return <section>
    <h2>{survivor ? 'Choose the batting pair after the wicket' : 'Choose opening batters'}</h2>
    {survivor && <p className="muted">{survivor} stays in. Choose which end they take and who joins them.</p>}
    <form onSubmit={event => {
      event.preventDefault()
      if (!busy && striker && partner) onSave({ striker, partner })
    }}>
      <div className="grid">
        <label>Striker<select value={striker} onChange={event => {
          const name = event.target.value
          setStriker(name)
          if (candidates.length === 2) setPartner(name ? candidates.find(item => item !== name) ?? '' : '')
        }} required disabled={busy}>
          <option value="">Select striker</option>
          {candidates.filter(name => candidates.length === 2
            || (name !== partner && (!survivor || !partner || partner === survivor || name === survivor)))
            .map(name => <option key={name} value={name}>{batterLabel(name)}</option>)}
        </select></label>
        <label>Other end<select value={partner} onChange={event => {
          const name = event.target.value
          setPartner(name)
          if (candidates.length === 2) setStriker(name ? candidates.find(item => item !== name) ?? '' : '')
        }} required disabled={busy}>
          <option value="">Select batter at the other end</option>
          {candidates.filter(name => candidates.length === 2
            || (name !== striker && (!survivor || !striker || striker === survivor || name === survivor)))
            .map(name => <option key={name} value={name}>{batterLabel(name)}</option>)}
        </select></label>
      </div>
      <button disabled={busy || !striker || !partner}>{busy ? 'Saving…' : 'Confirm batting pair'}</button>
    </form>
  </section>
}
