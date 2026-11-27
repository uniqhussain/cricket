import { useRef } from 'react'
import { seriesResult, type MatchListEntry, type Series } from './series'
import './series-panel.css'

const matchStatuses: Record<string, string> = { live: 'Live', complete: 'Completed', stopped: 'Stopped' }

export function MatchList({ matches, busy, openMatch }: {
  matches: MatchListEntry[]
  busy: boolean
  openMatch: (id: string) => void
}) {
  return <ul className="series-match-list">{matches.map(match => <li key={match.id}>
    <button type="button" className="series-match" aria-label={match.name} aria-describedby={'match-status-' + match.id}
      disabled={busy} onClick={() => openMatch(match.id)}>
      <span className="series-match-name">{match.name}</span>
      <span className="series-status" id={'match-status-' + match.id} data-status={match.status}>{matchStatuses[match.status] ?? match.status}</span>
      <span className="series-chevron" aria-hidden="true">›</span>
    </button>
  </li>)}</ul>
}

export default function SeriesPanel({ allSeries, current, admin, busy, error, matches, select, start, finish, addMatch, openMatch }: {
  allSeries: Series[]
  current?: Series
  admin: boolean
  busy: boolean
  error: string
  matches: MatchListEntry[]
  select: (id: string) => void
  start: (name: string, teamA: string, teamB: string) => Promise<boolean>
  finish: () => void
  addMatch: () => void
  openMatch: (id: string) => void
}) {
  const createDialog = useRef<HTMLDialogElement>(null)
  const result = current && seriesResult(current)
  return <section className="series-panel" aria-labelledby="series-title">
    <div className="series-panel-header">
      <h2 id="series-title">Series</h2>
      {admin && <button type="button" className="series-new" disabled={busy} onClick={() => createDialog.current?.showModal()}>
        <span className="series-plus" aria-hidden="true">+</span> Start new series
      </button>}
    </div>
    {admin && <dialog ref={createDialog} className="series-dialog" aria-labelledby="series-form-title">
      <div className="series-panel-header">
        <h2 id="series-form-title">New series</h2>
        <button type="button" className="series-secondary" disabled={busy} onClick={() => createDialog.current?.close()}>Cancel</button>
      </div>
      <form onSubmit={async event => {
        event.preventDefault()
        const form = event.currentTarget
        const fields = new FormData(form)
        if (await start(String(fields.get('name')), String(fields.get('teamA')), String(fields.get('teamB')))) {
          form.reset()
          createDialog.current?.close()
        }
      }}>
        <label>Series name<input name="name" required maxLength={80} disabled={busy} /></label>
        <div className="grid">
          <label>Team A<input name="teamA" required maxLength={80} disabled={busy} /></label>
          <label>Team B<input name="teamB" required maxLength={80} disabled={busy} /></label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={busy}>{busy ? 'Starting series…' : 'Start series'}</button>
      </form>
    </dialog>}
    {!current && <div className="series-empty">
      <h3>No series yet</h3>
      <p>{admin ? 'Start a series to choose your teams and add the first match.' : 'Your assigned series will appear here.'}</p>
    </div>}
    {current && <>
      {allSeries.length > 1 && <label>Choose series<select value={current.id} disabled={busy} onChange={event => select(event.target.value)}>
        {allSeries.map(series => <option key={series.id} value={series.id}>
          {series.name}{series.ended_at ? ' · Ended' : ' · Active'}
        </option>)}
      </select></label>}
      <div className="series-overview">
        <div className="series-panel-header">
          <h3>{current.name}</h3>
          <span className="series-status" data-status={current.ended_at ? 'complete' : 'live'}>{current.ended_at ? 'Ended' : 'Active'}</span>
        </div>
        <div className="series-tally" aria-label={current.team_a + ' ' + current.wins_a + ' to ' + current.wins_b + ' ' + current.team_b}>
          <span>{current.team_a}</span>
          <strong>{current.wins_a}<span>–</span>{current.wins_b}</strong>
          <span>{current.team_b}</span>
        </div>
        {(current.ties > 0 || current.stopped_matches > 0) && <p className="series-match-note">
          {[current.ties > 0 && current.ties + ' tied', current.stopped_matches > 0 && current.stopped_matches + ' stopped without a result'].filter(Boolean).join(' · ')}
        </p>}
        {result && <p className="series-result" role="status">{result}</p>}
      </div>
      {admin && !current.ended_at && <div className="actions">
        <button type="button" disabled={busy} onClick={addMatch}>Set up shared match</button>
        <button type="button" className="series-secondary" disabled={busy || current.live_matches > 0} onClick={finish}>End series</button>
      </div>}
      {admin && !current.ended_at && current.live_matches > 0 && <p className="muted">Finish or stop the live matches to end the series.</p>}
      <h3 className="series-matches-title">Series matches</h3>
      {matches.length ? <MatchList {...{ matches, busy, openMatch }} /> : <p className="series-match-note">No matches in this series yet.</p>}
    </>}
  </section>
}
