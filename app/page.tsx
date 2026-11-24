'use client'

import { useEffect, useRef, useState } from 'react'
import TeamSetup from './team-setup'
import PhotoSignIn from './photo-sign-in'
import UserSettings, { sharedRequest, type SessionUser } from './user-settings'
import type { Profile } from './profile'
import { replay, type Delivery } from './scoring'
import { canUmpire, frozenOvers, rulesFor, type Account, type Match, type RosterPlayer, type ScoreOperation, type SharedMatch } from './match'

const storageKey = 'turf-cricket-match-v1'

export default function Page() {
  const [localMatch, setLocalMatch] = useState<Match | null>(null)
  const [shared, setShared] = useState<SharedMatch | null>(null)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [matches, setMatches] = useState<{ id: string; name: string; status: string }[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [view, setView] = useState<'home' | 'settings'>('home')
  const [setup, setSetup] = useState<'shared' | 'local' | null>(null)
  const [showLocal, setShowLocal] = useState(false)
  const [busy, setBusy] = useState(false)
  const writing = useRef(false)
  const selection = useRef(0)
  const sessionVersion = useRef(0)
  const match = shared?.cricket_state ?? (showLocal ? localMatch : null)
  const canScore = !shared || canUmpire(user?.role)
  const [ready, setReady] = useState(false)
  const [bowler, setBowler] = useState('')
  const [error, setError] = useState('')
  const [running, setRunning] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const startedAt = match?.startedAt
  const stoppedAt = match?.stoppedAt

  useEffect(() => {
    if (!startedAt || stoppedAt) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [startedAt, stoppedAt])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const restored: Match = JSON.parse(saved)
        replay(rulesFor(restored, restored.innings), restored.games[restored.innings])
        setLocalMatch(restored)
      }
    } catch {
      setError('The saved match could not be restored.')
    } finally {
      setReady(true)
    }
    void refreshSession().catch(report)
  }, [])

  function report(error: unknown) {
    setError(error instanceof Error ? error.message : 'Could not update the match.')
  }

  async function refreshSession() {
    const version = ++sessionVersion.current
    const data = await sharedRequest<{ user: SessionUser | null; profile?: Profile | null; matches: typeof matches }>()
    if (version !== sessionVersion.current) return
    setUser(data.user)
    setProfile(data.profile ?? null)
    setMatches(data.matches)
    if (!data.user) {
      selection.current++
      setShared(null)
      setSetup(previous => previous === 'shared' ? null : previous)
    }
    const directory = data.user?.admin
      ? await sharedRequest<{ accounts: Account[]; profiles: Profile[] }>('?users')
      : { accounts: [], profiles: [] }
    if (version !== sessionVersion.current) return
    setAccounts(directory.accounts)
    setProfiles(directory.profiles)
  }

  const sharedId = shared?.id
  useEffect(() => {
    if (!sharedId) return
    let active = true
    let loading = false
    const timer = window.setInterval(async () => {
      if (loading || writing.current) return
      loading = true
      try {
        const data = await sharedRequest<{ match: SharedMatch; user: SessionUser }>('?match=' + sharedId)
        if (active) {
          setShared(previous => previous?.id === sharedId && previous.revision <= data.match.revision ? data.match : previous)
          setUser(data.user)
        }
      } catch (error) { if (active) report(error) }
      finally { loading = false }
    }, 4000)
    return () => { active = false; window.clearInterval(timer) }
  }, [sharedId])

  async function openMatch(id: string) {
    const version = ++selection.current
    try {
      const data = await sharedRequest<{ match: SharedMatch; user: SessionUser }>('?match=' + id)
      if (version !== selection.current) return
      setUser(data.user)
      setShared(data.match)
      setShowLocal(false)
      setSetup(null)
      setBowler('')
      setRunning(0)
      setError('')
    } catch (error) { if (version === selection.current) report(error) }
  }

  async function sharedWrite(body: object) {
    if (writing.current) return
    writing.current = true
    setBusy(true)
    setError('')
    const version = selection.current
    try {
      const data = await sharedRequest<{ match: SharedMatch }>('', body)
      if (version !== selection.current) return
      setShared(previous => previous?.id === data.match.id && previous.revision > data.match.revision ? previous : data.match)
      setSetup(null)
      setRunning(0)
      if ('operation' in body && body.operation === 'create') void refreshSession().catch(report)
    } catch (error) { report(error) }
    finally { writing.current = false; setBusy(false) }
  }

  function updateScore(action: ScoreOperation) {
    if (shared && canScore) void sharedWrite({ ...action, id: shared.id, revision: shared.revision })
  }

  function createMatch(match: Match, roster?: RosterPlayer[]) {
    if (setup === 'shared') void sharedWrite({ operation: 'create', match, roster })
    else { save(match); setShowLocal(true); setSetup(null) }
  }

  function save(updated: Match) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated))
      setLocalMatch(updated)
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
  const frozenCount = match ? frozenOvers(match, match.innings).at(-1)?.end ?? 0 : 0

  function addBall(kind: Delivery['kind'], runs: number, boundary?: 4 | 6, dismissed?: string, physicalRuns = runs) {
    if (!match || !rules || stoppedAt) return
    const ball: Delivery = { kind, batRuns: runs, boundary, dismissed, bowler: activeBowler, physicalRuns }
    if (shared) { updateScore({ operation: 'ball', ball }); return }
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

  const seconds = startedAt ? Math.max(0, Math.floor(((stoppedAt ?? now) - startedAt) / 1000)) : 0
  const duration = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':')

  return <main>
    <header className="site-header">
      Turf Cricket
      <nav className="actions" aria-label="Main navigation">
        <button type="button" aria-pressed={view === 'home'} onClick={() => setView('home')}>Home</button>
        <button type="button" aria-pressed={view === 'settings'} onClick={() => setView('settings')}>Settings</button>
      </nav>
    </header>
    {error && <p className="error" role="alert">{error}</p>}
    {view === 'settings' && <>
      <h1>Settings</h1>
      <section className="account-settings">
        <PhotoSignIn onSession={() => {
          selection.current++
          setShared(null)
          setSetup(previous => previous === 'shared' ? null : previous)
          setError('')
          void refreshSession().catch(report)
        }} />
        {!user && <p className="muted">Sign in with an admin account to create new user logins.</p>}
        {user && <UserSettings key={user.id} {...{ user, profile, accounts, profiles }} reload={refreshSession} />}
      </section>
    </>}
    <div hidden={view !== 'home'}>
    <h1>{match ? 'Match scorer' : 'Matches'}</h1>
    {match && <p className="muted">{shared ? 'Shared match · Saved to Supabase' : 'Local match · Saved in this browser'}</p>}
    {!ready && <p>Opening scorer…</p>}
    {ready && !match && <>
      <section>
        {user && <h2>Shared matches</h2>}
        {user && (matches.length ? <ul>{matches.map(item => <li key={item.id}>
          <button disabled={busy} onClick={() => void openMatch(item.id)}>{item.name}</button> · {item.status}
        </li>)}</ul> : <p>No shared matches assigned yet.</p>)}
        <div className="actions">
          {user?.admin && <button disabled={busy} onClick={() => setSetup('shared')}>Set up shared match</button>}
          {localMatch ? <button disabled={busy} onClick={() => { setShowLocal(true); setSetup(null) }}>Open local match</button>
            : <button disabled={busy} onClick={() => setSetup('local')}>Set up local match</button>}
        </div>
      </section>
      {setup && <TeamSetup key={setup} onStart={createMatch} accounts={setup === 'shared' ? accounts : undefined} profiles={profiles} busy={busy} />}
    </>}
    {match && score && rules && deliveries && <>
      <button disabled={busy} onClick={() => {
        selection.current++
        setShared(null)
        setShowLocal(false)
        setError('')
        void refreshSession().catch(report)
      }}>Back to matches</button>
      {shared && <button disabled={busy} onClick={() => void openMatch(shared.id)}>Refresh score</button>}
      {shared && !canScore && <p className="muted">You can view this score. Only admins and match umpires can update it.</p>}
      <section aria-label="Match timing">
        <h2>Match timer</h2>
        <p className="score" role="timer">{duration}</p>
        {startedAt && <p>Started {new Date(startedAt).toLocaleString()}</p>}
        {stoppedAt && <p>Stopped {new Date(stoppedAt).toLocaleString()}</p>}
        {canScore && !startedAt && <button disabled={busy} onClick={() => shared ? updateScore({ operation: 'timer' }) : save({ ...match, startedAt: Date.now() })}>Start timer</button>}
        {canScore && startedAt && !stoppedAt && <button disabled={busy} onClick={() => {
          if (!score.complete || match.innings !== 1) {
            if (!window.confirm('Stop this match now? Scoring will end.')) return
          }
          if (shared) updateScore({ operation: 'stop' })
          else save({ ...match, stoppedAt: Date.now() })
        }}>Stop match</button>}
      </section>
      <section aria-live="polite">
        {match.ground && <p className="muted">{match.ground.name}</p>}
        <div>{match.teamNames?.[match.innings] ?? ('Team ' + (match.innings === 0 ? 'A' : 'B'))} batting</div>
        <p className="score">{score.runs}/{score.wickets}</p>
        <p>{score.overs} / {rules.overs} overs · {score.extras} extras</p>
        {rules.target !== undefined && <p>Target {rules.target} · {Math.max(0, rules.target - score.runs)} needed from {rules.overs * 6 - score.legal} balls</p>}
        {score.complete && match.innings === 1 && <strong>{score.runs >= rules.target! ? (match.teamNames?.[1] ?? 'Team B') + ' wins' : score.runs === rules.target! - 1 ? 'Match tied' : (match.teamNames?.[0] ?? 'Team A') + ' wins'}</strong>}
      </section>
      {canScore && !score.complete && !stoppedAt && <section><fieldset disabled={busy}>
        <legend>Record delivery</legend>
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
      </fieldset></section>}
      {canScore && <section className="actions">
        {!stoppedAt && score.complete && match.innings === 0 && <button disabled={busy} onClick={() => {
          setBowler('')
          if (shared) updateScore({ operation: 'chase' })
          else save({ ...match, innings: 1 })
        }}>Start chase</button>}
        <button disabled={busy || !!stoppedAt || (shared ? deliveries.length <= frozenCount
          : (frozenCount > 0 && deliveries.length <= frozenCount) || (!deliveries.length && match.innings === 0))} onClick={() => {
          if (shared) { updateScore({ operation: 'undo' }); return }
          if (!deliveries.length && match.innings === 1) {
            save({ ...match, innings: 0 })
            return
          }
          const games: Match['games'] = [...match.games]
          games[match.innings] = deliveries.slice(0, -1)
          save({ ...match, games })
        }}>{!shared && !deliveries.length && match.innings === 1 ? 'Back to first innings' : 'Undo last delivery'}</button>
        {!shared && (stoppedAt || (!startedAt && score.complete && match.innings === 1)) && <button onClick={() => {
          if (!window.confirm('Clear this saved match and set up another?')) return
          try { localStorage.removeItem(storageKey); setLocalMatch(null); setShowLocal(false); setBowler('') } catch { setError('Could not clear this match.') }
        }}>New match</button>}
      </section>}
      <section><h2>Delivery log</h2>
        {deliveries.length ? <ol>{deliveries.map((ball, i) => <li key={i}>{ball.bowler} · {ball.kind} · {ball.kind === 'wide' ? 1 + ball.physicalRuns : ball.batRuns} runs{ball.dismissed ? ' · ' + ball.dismissed + ' out' : ''}</li>)}</ol> : <p>No deliveries yet.</p>}
      </section>
      <section><h2>Frozen overs</h2>
        {([0, 1] as const).map(innings => frozenOvers(match, innings).map(over => <details key={innings + ':' + over.over_number}>
          <summary>Innings {innings + 1} · Over {over.over_number} · {over.score.runs}/{over.score.wickets} · Locked</summary>
          <ol>{over.score.deliveries.map((ball, index) => <li key={index}>
            {ball.bowler} · {ball.kind} · {ball.kind === 'wide' ? ball.physicalRuns + 1 : ball.batRuns} runs{ball.dismissed ? ' · ' + ball.dismissed + ' out' : ''}
            {shared && user?.admin && <details>
              <summary>Correct delivery</summary>
              <form key={shared.revision} onSubmit={event => {
                event.preventDefault()
                const form = new FormData(event.currentTarget)
                const runs = Number(form.get('runs'))
                const boundary = Number(form.get('boundary')) as 0 | 4 | 6
                const dismissed = String(form.get('dismissed') ?? '')
                updateScore({ operation: 'correct', innings, index: over.start + index, ball: {
                  ...ball, batRuns: ball.kind === 'wide' ? 0 : boundary || runs,
                  physicalRuns: boundary ? 0 : runs, boundary: boundary || undefined, dismissed: dismissed || undefined,
                } })
              }}>
                <label>Runs completed<input type="number" name="runs" min={0} max={100} defaultValue={ball.physicalRuns} required /></label>
                {ball.kind !== 'wide' && <label>Boundary<select name="boundary" defaultValue={ball.boundary ?? 0}>
                  <option value={0}>None</option><option value={4}>Four</option><option value={6}>Six</option>
                </select></label>}
                {ball.kind === 'legal' && <label>Dismissed batter<select name="dismissed" defaultValue={ball.dismissed ?? ''}>
                  <option value="">None</option>
                  {match.sides[innings].map(batter => <option key={batter}>{batter}</option>)}
                </select></label>}
                <button disabled={busy}>Save correction</button>
              </form>
            </details>}
          </li>)}</ol>
        </details>))}
        {!frozenOvers(match, 0).length && !frozenOvers(match, 1).length && <p>No completed overs yet.</p>}
      </section>
      {shared && <section><h2>Score updates</h2>
        {shared.audit.length ? <ol>{shared.audit.map(entry => <li key={entry.id}>
          {entry.details.actorName ?? entry.actor_id} · {entry.action === 'lock' ? 'Locked over ' + entry.details.over
            : ({ ball: 'Recorded a delivery', correct: 'Corrected a delivery', undo: 'Undid a delivery',
              chase: 'Started the chase', stop: 'Stopped the match', timer: 'Started the timer' }[entry.details.operation ?? ''] ?? entry.action)}
          {entry.details.innings !== undefined && ' · Innings ' + (entry.details.innings + 1)}
          {entry.details.delivery !== undefined && ' · Delivery ' + entry.details.delivery}
          {' · ' + new Date(entry.created_at).toLocaleString()}
        </li>)}</ol> : <p>No scoring updates yet.</p>}
      </section>}
    </>}
    </div>
  </main>
}

