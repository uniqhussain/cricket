'use client'

import { useEffect, useRef, useState } from 'react'
import TeamSetup from './team-setup'
import GroundSettings from './ground-settings'
import SeriesPanel, { MatchList } from './series-panel'
import type { MatchListEntry, Series } from './series'
import MatchScorecard, { LiveFigures } from './match-scorecard'
import OverTimeline from './over-timeline'
import MatchToss from './match-toss'
import BattingPairPicker from './batting-pair'
import PhotoSignIn from './photo-sign-in'
import UserSettings, { SharedRequestError, sharedRequest, type SessionUser } from './user-settings'
import type { Profile } from './profile'
import { eligibleBowlers, replay, type Delivery } from './scoring'
import { applyOperation, awaitingToss, battingSide, canUmpire, elapsedMatchSeconds, frozenOvers, rulesFor, teamLabel, tossSummary, updateMatchFinish, type Account, type Ground, type Match, type RosterPlayer, type ScoreOperation, type SharedMatch } from './match'

const storageKey = 'turf-cricket-match-v1'

export default function CricketApp({ loginRequired = false }: { loginRequired?: boolean }) {
  const [localMatch, setLocalMatch] = useState<Match | null>(null)
  const [shared, setShared] = useState<SharedMatch | null>(null)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [matches, setMatches] = useState<MatchListEntry[]>([])
  const [series, setSeries] = useState<Series[]>([])
  const [seriesId, setSeriesId] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [grounds, setGrounds] = useState<Ground[]>([])
  const [view, setView] = useState<'home' | 'settings'>('home')
  const [setup, setSetup] = useState<'shared' | 'local' | null>(null)
  const [showLocal, setShowLocal] = useState(false)
  const [busy, setBusy] = useState(false)
  const writing = useRef(false)
  const selection = useRef(0)
  const sessionVersion = useRef(0)
  const match = shared?.cricket_state ?? (!loginRequired && showLocal ? localMatch : null)
  const canScore = !shared || (!shared.series_ended_at && canUmpire(user?.role))
  const currentSeries = series.find(item => item.id === seriesId) ?? series.find(item => !item.ended_at) ?? series[0]
  const pastMatches = matches.filter(item => !item.series_id)
  const [ready, setReady] = useState(false)
  const [bowler, setBowler] = useState('')
  const [error, setError] = useState('')
  const [running, setRunning] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const startedAt = match?.startedAt
  const stoppedAt = match?.stoppedAt
  const finishedAt = match?.finishedAt

  useEffect(() => {
    if (!startedAt || stoppedAt || finishedAt) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [startedAt, stoppedAt, finishedAt])

  useEffect(() => {
    if (loginRequired) {
      void refreshSession().catch(report).finally(() => setReady(true))
      const recheck = () => {
        if (document.visibilityState === 'visible') void refreshSession().catch(report)
      }
      document.addEventListener('visibilitychange', recheck)
      return () => document.removeEventListener('visibilitychange', recheck)
    }
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
  }, [loginRequired])

  function clearSession() {
    sessionVersion.current++
    selection.current++
    setUser(null)
    setProfile(null)
    setMatches([])
    setSeries([])
    setSeriesId('')
    setAccounts([])
    setProfiles([])
    setGrounds([])
    setShared(null)
    setSetup(previous => previous === 'shared' ? null : previous)
    if (loginRequired) setView('home')
  }

  function report(error: unknown) {
    if (error instanceof SharedRequestError && error.status === 401) clearSession()
    setError(error instanceof Error ? error.message : 'Could not update the match.')
  }

  async function refreshSession() {
    const version = ++sessionVersion.current
    const data = await sharedRequest<{ user: SessionUser | null; profile?: Profile | null; matches: MatchListEntry[]; series: Series[] }>()
    if (version !== sessionVersion.current) return
    if (!data.user) {
      clearSession()
      return null
    }
    setUser(data.user)
    setProfile(data.profile ?? null)
    setMatches(data.matches)
    setSeries(data.series ?? [])
    try {
      const directory = data.user.admin
        ? await sharedRequest<{ accounts: Account[]; profiles: Profile[]; grounds: Ground[] }>('?users')
        : { accounts: [], profiles: [], grounds: [] }
      if (version !== sessionVersion.current) return
      setAccounts(directory.accounts)
      setProfiles(directory.profiles)
      setGrounds(directory.grounds)
    } catch (error) {
      if (version !== sessionVersion.current) return
      report(error)
      if (error instanceof SharedRequestError && error.status === 401) return null
    }
    return data.user
  }

  async function sessionChanged(signedIn: boolean) {
    setError('')
    if (!signedIn) { clearSession(); return }
    if (await refreshSession() === null) throw new Error('This account does not have an active Turf Cricket session.')
    if (loginRequired) setView('home')
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
      if (data.match.series_id) setSeriesId(data.match.series_id)
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
    } catch (error) { if (version === selection.current) report(error) }
    finally { writing.current = false; setBusy(false) }
  }

  function updateScore(action: ScoreOperation) {
    if (shared && canScore) void sharedWrite({ ...action, id: shared.id, revision: shared.revision })
  }

  function createMatch(match: Match, roster?: RosterPlayer[]) {
    if (setup === 'shared' && currentSeries && !currentSeries.ended_at)
      void sharedWrite({ operation: 'create', match, roster, seriesId: currentSeries.id })
    else if (!loginRequired) { save(match); setShowLocal(true); setSetup(null) }
  }

  async function changeSeries(body: object) {
    if (writing.current) return false
    writing.current = true
    setBusy(true)
    setError('')
    try {
      const { id } = await sharedRequest<{ id: string }>('', body)
      setSeriesId(id)
      setSetup(null)
      await refreshSession()
      return true
    } catch (error) { report(error); return false }
    finally { writing.current = false; setBusy(false) }
  }

  function save(updated: Match) {
    try {
      const timed = updateMatchFinish(updated)
      localStorage.setItem(storageKey, JSON.stringify(timed))
      setLocalMatch(timed)
      setError('')
    } catch {
      setError('This browser could not save the match.')
    }
  }

  async function addGround(name: string) {
    const { ground } = await sharedRequest<{ ground: Ground }>('', { operation: 'addGround', name })
    setGrounds(previous => [...previous.filter(item => item.id !== ground.id), ground]
      .sort((first, second) => first.name.localeCompare(second.name)))
  }

  const rules = match && rulesFor(match, match.innings)
  const tossPending = match && awaitingToss(match)
  const deliveries = match && match.games[match.innings]
  const score = rules && deliveries && replay(rules, deliveries)
  const available = rules && score ? eligibleBowlers(rules, score) : []
  const activeBowler = score?.currentBowler ?? (available.includes(bowler) ? bowler : '')
  const frozenCount = match ? frozenOvers(match, match.innings).at(-1)?.end ?? 0 : 0

  function addBall(kind: Delivery['kind'], runs: number, boundary?: 4 | 6, dismissed?: string, physicalRuns = runs) {
    if (!match || !rules || stoppedAt) return
    const ball: Delivery = { kind, batRuns: runs, boundary, dismissed, bowler: activeBowler, physicalRuns }
    if (shared) { updateScore({ operation: 'ball', ball }); return }
    try {
      save(applyOperation(match, { operation: 'ball', ball }, true))
      setRunning(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the delivery.')
    }
  }

  const seconds = match ? elapsedMatchSeconds(match, now) : 0
  const duration = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':')

  if (loginRequired && (!ready || !user)) return <main className="sign-in-screen">
    <header>Turf Cricket</header>
    <h1>Sign in to Turf Cricket</h1>
    {error && <p className="error" role="alert">{error}</p>}
    {!ready ? <p role="status">Checking your session…</p> : <section>
      <PhotoSignIn signedIn={false} onSession={sessionChanged} />
    </section>}
  </main>

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
        <PhotoSignIn signedIn={Boolean(user)} onSession={sessionChanged} />
        {!user && <p className="muted">Sign in with an admin account to create new user logins.</p>}
        {user && <UserSettings key={user.id} {...{ user, profile, accounts, profiles }} reload={async () => { await refreshSession() }} />}
      </section>
      {user?.admin && <GroundSettings grounds={grounds} addGround={addGround} />}
    </>}
    <div hidden={view !== 'home'}>
    <h1>{match ? tossPending ? 'Match toss' : 'Match scorer' : 'Cricket matches'}</h1>
    {match && <p className="muted">{shared ? 'Shared match · Saved to Supabase' : 'Local match · Saved in this browser'}</p>}
    {!ready && <p>Opening scorer…</p>}
    {ready && !match && <>
      {user && <SeriesPanel allSeries={series} current={currentSeries} admin={user.admin} busy={busy}
        matches={matches.filter(item => item.series_id === currentSeries?.id)} openMatch={id => void openMatch(id)}
        select={id => { setSeriesId(id); setSetup(null) }} addMatch={() => setSetup('shared')}
        start={(name, teamA, teamB) => changeSeries({ operation: 'startSeries', name, teamA, teamB })}
        finish={() => {
          if (currentSeries && window.confirm('End this series and finalize the result?'))
            void changeSeries({ operation: 'endSeries', seriesId: currentSeries.id })
        }} />}
      {pastMatches.length > 0 && <section><h2>Matches outside a series</h2>
        <MatchList matches={pastMatches} busy={busy} openMatch={id => void openMatch(id)} />
      </section>}
      {!loginRequired && (localMatch ? <button disabled={busy} onClick={() => { setShowLocal(true); setSetup(null) }}>Open local match</button>
        : <button disabled={busy} onClick={() => setSetup('local')}>Set up local match</button>)}
      {setup && (setup !== 'shared' || (currentSeries && !currentSeries.ended_at))
        && <TeamSetup key={setup + (currentSeries?.id ?? '')} onStart={createMatch} accounts={setup === 'shared' ? accounts : undefined}
        seriesTeams={setup === 'shared' && currentSeries ? [currentSeries.team_a, currentSeries.team_b] : undefined}
        profiles={profiles} grounds={grounds} openGroundSettings={() => setView('settings')} busy={busy} />}
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
      {tossPending ? canScore ? <><MatchToss key={shared?.id} match={match} busy={busy} onSave={toss => {
        const action = { operation: 'toss', toss } as const
        if (shared) updateScore(action)
        else save(applyOperation(match, action, true))
      }} />{shared?.series_id && <button disabled={busy} onClick={() => {
        if (window.confirm('Stop this match without a result?')) updateScore({ operation: 'stop' })
      }}>Stop match</button>}</> : <section><p>Waiting for an admin or match umpire to record the toss.</p></section> : <>
      {shared && !canScore && <p className="muted">{shared.series_ended_at
        ? 'This series has ended. Its results are final.'
        : 'You can view this score. Only admins and match umpires can update it.'}</p>}
      <section aria-label="Match timing">
        <h2>Match timer</h2>
        <p className="score" role="timer">{duration}</p>
        {startedAt && <p>Started {new Date(startedAt).toLocaleString()}</p>}
        {stoppedAt && <p>Stopped {new Date(stoppedAt).toLocaleString()}</p>}
        {finishedAt && <p>Finished {new Date(finishedAt).toLocaleString()}</p>}
        {canScore && !startedAt && <button disabled={busy} onClick={() => shared ? updateScore({ operation: 'timer' }) : save({ ...match, startedAt: Date.now() })}>Start timer</button>}
        {canScore && startedAt && !stoppedAt && !finishedAt && <button disabled={busy} onClick={() => {
          if (!score.complete || match.innings !== 1) {
            if (!window.confirm('Stop this match now? Scoring will end.')) return
          }
          if (shared) updateScore({ operation: 'stop' })
          else save({ ...match, stoppedAt: Date.now() })
        }}>Stop match</button>}
      </section>
      <section aria-live="polite">
        {match.ground && <p className="muted">{match.ground.name}</p>}
        {match.toss && <p>{tossSummary(match)}</p>}
        <div>{teamLabel(match, battingSide(match, match.innings))} batting</div>
        <p className="score">{score.runs}/{score.wickets}</p>
        <p>{score.overs} / {rules.overs} overs · {score.extras} extras</p>
        {rules.target !== undefined && <p>Target {rules.target} · {Math.max(0, rules.target - score.runs)} needed from {rules.overs * 6 - score.legal} balls</p>}
        {score.complete && match.innings === 1 && <strong>{score.runs >= rules.target!
          ? teamLabel(match, battingSide(match, 1)) + ' wins'
          : score.runs === rules.target! - 1 ? 'Match tied' : teamLabel(match, battingSide(match, 0)) + ' wins'}</strong>}
      </section>
      {score.pendingPair && !stoppedAt && (canScore
        ? <BattingPairPicker key={match.innings + ':' + deliveries.length} {...score.pendingPair} busy={busy}
            onSave={pair => {
              const action = { operation: 'batters', pair } as const
              if (shared) updateScore(action)
              else save(applyOperation(match, action, true))
            }} />
        : <section><p>Waiting for the umpire to choose the batting pair.</p></section>)}
      {canScore && !score.pendingPair && !score.complete && !stoppedAt && <section><fieldset disabled={busy}>
        <legend>Record delivery</legend>
        <p><strong>{score.striker}</strong> on strike{score.partner ? ' · ' + score.partner + ' at the other end' : ' · batting alone'}</p>
        <label>Bowler<select value={activeBowler} disabled={!!score.currentBowler} onChange={e => setBowler(e.target.value)}>
          <option value="">Select bowler</option>
          {(score.currentBowler ? [score.currentBowler] : available).map(name => <option key={name}>{name}</option>)}
        </select></label>
        <div className="actions scoring-pad">
          {[0, 1, 2, 3].map(n => <button key={n} disabled={!activeBowler} onClick={() => addBall('legal', n)}>{n}</button>)}
          {[4, 6].map(n => <button key={n} className={n === 4 ? 'delivery-four' : 'delivery-six'} disabled={!activeBowler}
            onClick={() => addBall('legal', n, n as 4 | 6, undefined, 0)}>{n}</button>)}
          <button className="delivery-wicket" disabled={!activeBowler} onClick={() => addBall('legal', 0, undefined, score.striker)}>Wicket</button>
        </div>
        <label>Physical runs<input type="number" min="0" value={running} onChange={e => setRunning(Number(e.target.value))} /></label>
        <div className="actions">
          <button disabled={!activeBowler} onClick={() => addBall('legal', running)}>Runs completed</button>
          <button className="delivery-extra" disabled={!activeBowler} onClick={() => addBall('wide', 0, undefined, undefined, running)}>Wide</button>
          <button className="delivery-extra" disabled={!activeBowler} onClick={() => addBall('no-ball', running)}>No-ball</button>
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
          save(applyOperation(match, { operation: 'undo' }, true))
        }}>{!shared && !deliveries.length && match.innings === 1 ? 'Back to first innings' : 'Undo last delivery'}</button>
        {!shared && (stoppedAt || (score.complete && match.innings === 1)) && <button onClick={() => {
          if (!window.confirm('Clear this saved match and set up another?')) return
          try { localStorage.removeItem(storageKey); setLocalMatch(null); setShowLocal(false); setBowler('') } catch { setError('Could not clear this match.') }
        }}>New match</button>}
      </section>}
      <OverTimeline key={shared?.id ?? startedAt} match={match} currentComplete={score.complete} revision={shared?.revision} busy={busy}
        onCorrect={shared && user?.admin && canScore ? updateScore : undefined} />
      {!finishedAt && !stoppedAt && <LiveFigures score={score} bowler={activeBowler} />}
      <MatchScorecard key={shared?.id ?? startedAt} match={match} />
      {shared && <section><h2>Score updates</h2>
        {shared.audit.length ? <ol>{shared.audit.map(entry => <li key={entry.id}>
          {entry.details.actorName ?? entry.actor_id} · {entry.details.toss
            ? 'Recorded toss: ' + teamLabel(match, entry.details.toss.winner) + ' chose to ' + entry.details.toss.decision
            : entry.details.pair ? 'Set batting pair: ' + entry.details.pair.striker + ' on strike, ' + entry.details.pair.partner + ' at the other end'
            : entry.action === 'lock' ? 'Locked over ' + entry.details.over
            : ({ ball: 'Recorded a delivery', correct: 'Corrected a delivery', undo: 'Undid a delivery',
              chase: 'Started the chase', stop: 'Stopped the match', timer: 'Started the timer' }[entry.details.operation ?? ''] ?? entry.action)}
          {entry.details.innings !== undefined && ' · Innings ' + (entry.details.innings + 1)}
          {entry.details.delivery !== undefined && ' · Delivery ' + entry.details.delivery}
          {' · ' + new Date(entry.created_at).toLocaleString()}
        </li>)}</ol> : <p>No scoring updates yet.</p>}
      </section>}
      </>}
    </>}
    </div>
  </main>
}
