import { seriesResult, type MatchListEntry, type Series } from './series'

export function MatchList({ matches, busy, openMatch }: {
  matches: MatchListEntry[]
  busy: boolean
  openMatch: (id: string) => void
}) {
  return <ul>{matches.map(match => <li key={match.id}>
    <button disabled={busy} onClick={() => openMatch(match.id)}>{match.name}</button> · {match.status}
  </li>)}</ul>
}

export default function SeriesPanel({ allSeries, current, admin, busy, matches, select, start, finish, addMatch, openMatch }: {
  allSeries: Series[]
  current?: Series
  admin: boolean
  busy: boolean
  matches: MatchListEntry[]
  select: (id: string) => void
  start: (name: string, teamA: string, teamB: string) => Promise<boolean>
  finish: () => void
  addMatch: () => void
  openMatch: (id: string) => void
}) {
  const result = current && seriesResult(current)
  return <section>
    <h2>Series</h2>
    {admin && <details open={!current || undefined}>
      <summary>Start a new series</summary>
      <form onSubmit={async event => {
        event.preventDefault()
        const form = event.currentTarget
        const fields = new FormData(form)
        if (await start(String(fields.get('name')), String(fields.get('teamA')), String(fields.get('teamB')))) {
          form.reset()
          const details = form.closest('details')
          if (details) details.open = false
        }
      }}>
        <label>Series name<input name="name" required maxLength={80} disabled={busy} /></label>
        <div className="grid">
          <label>Team A<input name="teamA" required maxLength={80} disabled={busy} /></label>
          <label>Team B<input name="teamB" required maxLength={80} disabled={busy} /></label>
        </div>
        <button disabled={busy}>Start series</button>
      </form>
    </details>}
    {!current && !admin && <p>No series assigned yet.</p>}
    {current && <>
      <label>Choose series<select value={current.id} disabled={busy} onChange={event => select(event.target.value)}>
        {allSeries.map(series => <option key={series.id} value={series.id}>
          {series.name}{series.ended_at ? ' · Ended' : ' · Active'}
        </option>)}
      </select></label>
      <h3>{current.team_a} vs {current.team_b}</h3>
      <p>{current.team_a} <strong>{current.wins_a}</strong>–<strong>{current.wins_b}</strong> {current.team_b}
        {current.ties > 0 && ' · ' + current.ties + ' tied'}</p>
      {current.stopped_matches > 0 && <p className="muted">{current.stopped_matches} stopped without a result</p>}
      {result && <p className="settings-success" role="status"><strong>{result}</strong></p>}
      {admin && !current.ended_at && <div className="actions">
        <button disabled={busy} onClick={addMatch}>Set up shared match</button>
        <button disabled={busy || current.live_matches > 0} onClick={finish}>End series</button>
      </div>}
      {admin && !current.ended_at && current.live_matches > 0 && <p className="muted">Finish or stop the live matches to end the series.</p>}
      <h3>Series matches</h3>
      {matches.length ? <MatchList {...{ matches, busy, openMatch }} /> : <p>No matches in this series yet.</p>}
    </>}
  </section>
}
