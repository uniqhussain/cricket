'use client'

import { useEffect, useState } from 'react'
import TeamSetup from './team-setup'
import { replay, type Delivery, type Rules } from './scoring'

export type Match = { ground?: { id: string; name: string }; overs?: number; teamNames?: [string, string]; sides: [string[], string[]]; games: [Delivery[], Delivery[]]; innings: 0 | 1; lastMan: boolean; designations: [string, string] }

function rulesFor(match: Match, innings: 0 | 1): Rules {
  return {
    overs: match.overs ?? 5,
    batters: match.sides[innings],
    bowlers: match.sides[1 - innings],
    designated: match.designations[innings],
    lastMan: match.lastMan,
    target: innings === 1 ? replay(rulesFor(match, 0), match.games[0]).runs + 1 : undefined,
  }
}

const storageKey = 'turf-cricket-match-v1'

export default function Page() {
  const [match, setMatch] = useState<Match | null>(null)
  const [ready, setReady] = useState(false)
  const [bowler, setBowler] = useState('')
  const [error, setError] = useState('')
  const [running, setRunning] = useState(0)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const restored: Match = JSON.parse(saved)
        replay(rulesFor(restored, restored.innings), restored.games[restored.innings])
        setMatch(restored)
      }
    } catch {
      setError('The saved match could not be restored.')
    } finally {
      setReady(true)
    }
  }, [])

  function save(updated: Match) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated))
      setMatch(updated)
      setError('')
    } catch {
      setError('This browser could not save the match.')
    }
  }

  const rules = match && rulesFor(match, match.innings)
  const deliveries = match && match.games[match.innings]
  const score = rules && deliveries && replay(rules, deliveries)
  const available = rules && score ? rules.bowlers.filter(name =>
    name !== score.striker && name !== score.partner && name !== score.previousBowler
    && (score.quota[name] ?? 0) < (name === rules.designated ? 12 : 6)
  ) : []
  const activeBowler = score?.currentBowler ?? (available.includes(bowler) ? bowler : '')

  function addBall(kind: Delivery['kind'], runs: number, boundary?: 4 | 6, dismissed?: string, physicalRuns = runs) {
    if (!match || !rules) return
    const ball: Delivery = { kind, batRuns: runs, boundary, dismissed, bowler: activeBowler, physicalRuns }
    const games: Match['games'] = [...match.games]
    games[match.innings] = [...games[match.innings], ball]
    try {
      replay(rules, games[match.innings])
      save({ ...match, games })
      setRunning(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the delivery.')
    }
  }

  return <main>
    <header>Turf Cricket</header>
    <h1>{match ? 'Match scorer' : 'Set up a match'}</h1>
    <p className="muted">Local scoring preview · Saved in this browser</p>
    {error && <p className="error" role="alert">{error}</p>}
    {!ready && <p>Opening scorer…</p>}
    {ready && !match && <TeamSetup onStart={save} />}
    {match && score && rules && deliveries && <>
      <section aria-live="polite">
        {match.ground && <p className="muted">{match.ground.name}</p>}
        <div>{match.teamNames?.[match.innings] ?? ('Team ' + (match.innings === 0 ? 'A' : 'B'))} batting</div>
        <p className="score">{score.runs}/{score.wickets}</p>
        <p>{score.overs} / {rules.overs} overs · {score.extras} extras</p>
        {rules.target !== undefined && <p>Target {rules.target} · {Math.max(0, rules.target - score.runs)} needed from {rules.overs * 6 - score.legal} balls</p>}
        {score.complete && match.innings === 1 && <strong>{score.runs >= rules.target! ? (match.teamNames?.[1] ?? 'Team B') + ' wins' : score.runs === rules.target! - 1 ? 'Match tied' : (match.teamNames?.[0] ?? 'Team A') + ' wins'}</strong>}
      </section>
      {!score.complete && <section>
        <p><strong>{score.striker}</strong> on strike{score.partner ? ' · ' + score.partner + ' at the other end' : ' · batting alone'}</p>
        <label>Bowler<select value={activeBowler} disabled={!!score.currentBowler} onChange={e => setBowler(e.target.value)}>
          <option value="">Select bowler</option>
          {(score.currentBowler ? [score.currentBowler] : available).map(name => <option key={name}>{name}</option>)}
        </select></label>
        <div className="actions">
          {[0, 1, 2, 3].map(n => <button key={n} disabled={!activeBowler} onClick={() => addBall('legal', n)}>{n}</button>)}
          {[4, 6].map(n => <button key={n} disabled={!activeBowler} onClick={() => addBall('legal', n, n as 4 | 6, undefined, 0)}>{n}</button>)}
          <button disabled={!activeBowler} onClick={() => addBall('legal', 0, undefined, score.striker)}>Wicket</button>
        </div>
        <label>Physical runs<input type="number" min="0" value={running} onChange={e => setRunning(Number(e.target.value))} /></label>
        <div className="actions">
          <button disabled={!activeBowler} onClick={() => addBall('legal', running)}>Runs completed</button>
          <button disabled={!activeBowler} onClick={() => addBall('wide', 0, undefined, undefined, running)}>Wide</button>
          <button disabled={!activeBowler} onClick={() => addBall('no-ball', running)}>No-ball</button>
        </div>
      </section>}
      <section className="actions">
        {score.complete && match.innings === 0 && <button onClick={() => { setBowler(''); save({ ...match, innings: 1 }) }}>Start chase</button>}
        <button disabled={!deliveries.length && match.innings === 0} onClick={() => {
          if (!deliveries.length && match.innings === 1) {
            save({ ...match, innings: 0 })
            return
          }
          const games: Match['games'] = [...match.games]
          games[match.innings] = deliveries.slice(0, -1)
          save({ ...match, games })
        }}>{!deliveries.length && match.innings === 1 ? 'Back to first innings' : 'Undo last delivery'}</button>
        {score.complete && match.innings === 1 && <button onClick={() => {
          if (!window.confirm('Clear this saved match and set up another?')) return
          try { localStorage.removeItem(storageKey); setMatch(null); setBowler('') } catch { setError('Could not clear this match.') }
        }}>New match</button>}
      </section>
      <section><h2>Delivery log</h2>
        {deliveries.length ? <ol>{deliveries.map((ball, i) => <li key={i}>{ball.bowler} · {ball.kind} · {ball.kind === 'wide' ? 1 + ball.physicalRuns : ball.batRuns} runs{ball.dismissed ? ' · ' + ball.dismissed + ' out' : ''}</li>)}</ol> : <p>No deliveries yet.</p>}
      </section>
    </>}
  </main>
}

