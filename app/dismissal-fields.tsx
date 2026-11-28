import { useState } from 'react'
import type { Dismissal } from './scoring'

export function readDismissal(form: FormData): Dismissal | undefined {
  const kind = form.get('dismissalKind')
  if (kind === 'bowler' || kind === 'bowled') return { kind }
  if (kind === 'caught' || kind === 'stumped' || kind === 'run-out')
    return { kind, fielder: String(form.get('fielder') ?? '') }
}

export default function DismissalFields({ fielders, initial, legacy, onKindChange }: {
  fielders: string[]
  initial?: Dismissal
  legacy?: boolean
  onKindChange?: (kind: Dismissal['kind'] | '') => void
}) {
  const [kind, setKind] = useState<Dismissal['kind'] | ''>(initial?.kind ?? (legacy ? '' : 'bowled'))
  return <>
    <label>Dismissal type<select name="dismissalKind" value={kind} onChange={event => {
      const value = event.target.value as Dismissal['kind'] | ''
      setKind(value)
      onKindChange?.(value)
    }}>
      {legacy && <option value="">Unspecified</option>}
      {legacy && <option value="bowler">Bowler wicket (unspecified)</option>}
      <option value="bowled">Bowled</option>
      <option value="caught">Caught</option>
      <option value="stumped">Stumped</option>
      <option value="run-out">Run-out</option>
    </select></label>
    {(kind === 'caught' || kind === 'stumped' || kind === 'run-out') && <label>Fielder<select name="fielder" required defaultValue={initial && 'fielder' in initial ? initial.fielder : ''}>
      <option value="">Select fielder</option>
      {fielders.map(name => <option key={name}>{name}</option>)}
    </select></label>}
  </>
}

export function WicketEntry({ striker, partner, fielders, onSave }: {
  striker: string
  partner?: string
  fielders: string[]
  onSave: (dismissed: string, dismissal: Dismissal, runs: number) => void
}) {
  const [kind, setKind] = useState<Dismissal['kind'] | ''>('bowled')
  return <form className="settings-group" onSubmit={event => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const dismissal = readDismissal(form)
    if (dismissal) onSave(String(form.get('dismissed') ?? striker), dismissal, Number(form.get('wicketRuns') ?? 0))
  }}>
    <DismissalFields fielders={fielders} onKindChange={setKind} />
    {kind === 'run-out' && partner && <label>Batter out<select name="dismissed" defaultValue={striker}>
      <option>{striker}</option><option>{partner}</option>
    </select></label>}
    {kind === 'run-out' && <label>Runs completed<input name="wicketRuns" type="number" min={0} max={100} defaultValue={0} required /></label>}
    <button>Record wicket</button>
  </form>
}

export function RetirementEntry({ active, replacements, retired, onSave }: {
  active: string[]
  replacements: string[]
  retired: string[]
  onSave: (batter: string, replacement?: string) => void
}) {
  return <form className="settings-group" onSubmit={event => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const replacement = form.get('replacement')
    onSave(String(form.get('batter')), replacement ? String(replacement) : undefined)
  }}>
    <label>Injured batter<select name="batter" required>{active.map(name => <option key={name}>{name}</option>)}</select></label>
    {replacements.length ? <label>Replacement batter<select name="replacement" required defaultValue="">
      <option value="">Choose a batter</option>
      {replacements.map(name => <option key={name} value={name}>{retired.includes(name) ? name + ' (retired hurt)' : name}</option>)}
    </select></label> : <p className="muted">No replacement batter is available.</p>}
    <button>Confirm retired hurt</button>
  </form>
}
