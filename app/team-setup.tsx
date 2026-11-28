'use client'

import { useEffect, useState } from 'react'
import type { Account, Ground, Match, RosterPlayer } from './match'
import type { SeriesSetup } from './series'
import { preparePlayerPhoto, uploadPlayerPhoto } from './player-photo'
import { battingHands, bowlingStyles, roles, type PlayerDetails, type Profile } from './profile'

type Player = PlayerDetails & {
  id: string
  name: string
  nickname?: string
}
const registryKey = 'turf-cricket-players-v1'

export default function TeamSetup({ onStart, accounts, profiles = [], grounds, openGroundSettings, seriesTeams, defaults, busy }: {
  onStart: (match: Match, roster?: RosterPlayer[]) => void
  accounts?: Account[]
  profiles?: Profile[]
  grounds: Ground[]
  openGroundSettings: () => void
  seriesTeams?: [string, string]
  defaults?: SeriesSetup
  busy?: boolean
}) {
  const [players, setPlayers] = useState<Player[]>([])
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [role, setRole] = useState<typeof roles[number] | ''>('')
  const [jersey, setJersey] = useState('')
  const [batting, setBatting] = useState<typeof battingHands[number]>('Right-hand bat')
  const [bowling, setBowling] = useState<typeof bowlingStyles[number]>("Doesn't bowl")
  const [isCaptain, setIsCaptain] = useState(false)
  const [photo, setPhoto] = useState('')
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const [savingPlayer, setSavingPlayer] = useState(false)
  const [uploadedPhoto, setUploadedPhoto] = useState('')
  const [photoInputKey, setPhotoInputKey] = useState(0)
  const [teams, setTeams] = useState<[string, string]>(seriesTeams ?? ['', ''])
  const [nicknames, setNicknames] = useState<[string, string]>(defaults?.nicknames ?? ['', ''])
  const [oversInput, setOversInput] = useState<string | null>(defaults?.overs === undefined ? null : String(defaults.overs))
  const [members, setMembers] = useState<[string[], string[]]>(() => {
    if (!defaults) return [[], []]
    const eligible = (id: string) => accounts?.some(account => account.id === id && !account.disabled)
    return [defaults.members[0].filter(eligible), defaults.members[1].filter(eligible)]
  })
  const [editingTeams, setEditingTeams] = useState(members.some((team, index) => team.length < 2 || team.length !== defaults?.members[index].length))
  const [batFirst, setBatFirst] = useState<0 | 1>()
  const [selection, setSelection] = useState<[string, string]>(['', ''])
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [groundId, setGroundId] = useState(grounds.find(ground => ground.id === defaults?.groundId)?.id ?? '')
  const [step, setStep] = useState<'players' | 'teams' | 'rosters'>(accounts ? groundId ? 'rosters' : 'teams' : 'players')

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(registryKey) ?? '[]')
      if (!Array.isArray(stored) || !stored.every(p => typeof p.id === 'string' && typeof p.name === 'string')) throw new Error()
      setPlayers(stored)
    } catch { setError('Could not open the saved player list.') }
    setLoaded(true)
  }, [])

  const rosterPlayers: Player[] = accounts
    ? accounts.filter(account => !account.disabled).map(account => {
      const profile = profiles.find(item => item.user_id === account.id)
      return { ...profile?.details, id: account.id, name: profile?.name || account.label.slice(0, 80), nickname: profile?.nickname || account.label }
    }) : players
  const playerName = (id: string) => rosterPlayers.find(player => player.id === id)?.name ?? ''
  const maxOvers = Math.min(20, Math.min(members[0].length, members[1].length) + 1)
  const ground = grounds.find(item => item.id === groundId)
  const playerCard = (id: string) => {
    const player = rosterPlayers.find(player => player.id === id)
    if (!player) return <span>Unavailable account</span>
    return <span className="player-card">
      {player.photo && <img src={player.photo} alt={player.name} width={48} height={48} />}
      <span>{player.name}{player.nickname && <small>{player.nickname}</small>}
        {player.role && <small>{player.role}{player.jersey ? ' · #' + player.jersey : ''}{player.isCaptain ? ' · Captain' : ''}</small>}
        {player.batting && <small>{player.batting}{player.bowling && player.bowling !== "Doesn't bowl" ? ' · ' + player.bowling : ''}</small>}
      </span>
    </span>
  }

  return <>
    {error && <p role="alert" className="error">{error}</p>}
    {step === 'players' && <section>
      <h2>Add players</h2>
      <form onSubmit={async event => {
        event.preventDefault()
        const trimmed = name.trim()
        if (!trimmed) return
        if (!role) {
          setError('Select a player role.')
          return
        }
        if (jersey && !/^\d{1,3}$/.test(jersey)) {
          setError('Enter a jersey number from 0 to 999.')
          return
        }
        if (players.some(player => player.name.toLowerCase() === trimmed.toLowerCase())) {
          setError('This player is already in the list.')
          return
        }
        if (processingPhoto || savingPlayer) return
        setSavingPlayer(true)
        try {
          let savedPhoto = uploadedPhoto
          if (photo && !savedPhoto) {
            savedPhoto = await uploadPlayerPhoto(photo)
            setUploadedPhoto(savedPhoto)
          }
          const updated = [...players, {
            id: crypto.randomUUID(), name: trimmed, nickname: nickname.trim(), photo: savedPhoto,
            role, jersey, batting, bowling, isCaptain,
          }]
          localStorage.setItem(registryKey, JSON.stringify(updated))
          setPlayers(updated)
          setName('')
          setNickname('')
          setRole('')
          setJersey('')
          setBatting('Right-hand bat')
          setBowling("Doesn't bowl")
          setIsCaptain(false)
          setPhoto('')
          setUploadedPhoto('')
          setPhotoInputKey(key => key + 1)
          setError('')
        } catch (err) { setError(err instanceof Error ? err.message : 'Could not save this player. Please retry.') }
        finally { setSavingPlayer(false) }
      }}>
        <label>Full name<input value={name} disabled={savingPlayer} onChange={e => setName(e.target.value)} required maxLength={80} /></label>
        <label>Nickname (optional)<input value={nickname} disabled={savingPlayer} onChange={e => setNickname(e.target.value)} maxLength={40} /></label>
        <fieldset disabled={savingPlayer}>
          <legend>Role</legend>
          <div className="role-options">{roles.map(option => <label key={option}>
            <input type="radio" name="role" value={option} checked={role === option} onChange={() => setRole(option)} required />
            {option}
          </label>)}</div>
        </fieldset>
        <div className="grid">
          <label>Jersey number (optional)<input value={jersey} disabled={savingPlayer} onChange={e => setJersey(e.target.value)} inputMode="numeric" pattern="[0-9]{1,3}" maxLength={3} placeholder="#" /></label>
          <label>Batting<select value={batting} disabled={savingPlayer} onChange={e => setBatting(e.target.value as typeof battingHands[number])}>
            {battingHands.map(option => <option key={option}>{option}</option>)}
          </select></label>
        </div>
        <label>Bowling style (optional)<select value={bowling} disabled={savingPlayer} onChange={e => setBowling(e.target.value as typeof bowlingStyles[number])}>
          {bowlingStyles.map(option => <option key={option}>{option}</option>)}
        </select></label>
        <label className="captain-option"><input type="checkbox" checked={isCaptain} disabled={savingPlayer} onChange={e => setIsCaptain(e.target.checked)} /> Club captain</label>
        <label>Photo (optional, sign in through Settings to upload)<input key={photoInputKey} type="file" accept="image/jpeg,image/png,image/webp" disabled={processingPhoto || savingPlayer} onChange={async event => {
          const file = event.target.files?.[0]
          if (!file) return
          setPhoto('')
          setUploadedPhoto('')
          setProcessingPhoto(true)
          setError('')
          try { setPhoto(await preparePlayerPhoto(file)) }
          catch (err) { setError(err instanceof Error ? err.message : 'Could not read this photo.') }
          finally { setProcessingPhoto(false) }
        }} /></label>
        {processingPhoto && <p role="status">Preparing photo…</p>}
        {photo && <div className="player-card">
          <img src={photo} alt="Selected player photo preview" width={64} height={64} />
          <button type="button" disabled={savingPlayer} onClick={() => { setPhoto(''); setUploadedPhoto(''); setPhotoInputKey(key => key + 1) }}>Remove photo</button>
        </div>}
        <button disabled={!loaded || processingPhoto || savingPlayer}>{savingPlayer ? 'Saving player…' : 'Add player'}</button>
      </form>
      {players.length ? <ul className="player-list">{players.map(player => <li key={player.id}>{playerCard(player.id)}</li>)}</ul> : <p>Add your players one at a time.</p>}
      <button onClick={() => setStep('teams')} disabled={!players.length}>Continue to teams</button>
    </section>}
    {step === 'teams' && <section><form onSubmit={event => {
      event.preventDefault()
      const [first, second] = teams.map(name => name.trim().toLowerCase())
      if (!first || !second || first === second) {
        setError('Enter a different name for each team.')
        return
      }
      if ((nicknames[0].trim().toLowerCase() || first) === (nicknames[1].trim().toLowerCase() || second)) {
        setError('Use a different display name for each team.')
        return
      }
      if (accounts && !ground) {
        setError('Choose a saved ground.')
        return
      }
      setError('')
      setStep('rosters')
    }}>
      <h2>Ground and team names</h2>
      <label>Match ground<select required={Boolean(accounts)} value={groundId} onChange={event => setGroundId(event.target.value)}>
        <option value="">{accounts ? 'Select ground' : 'No ground selected'}</option>
        {grounds.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      {accounts && grounds.length === 0 && <button type="button" onClick={openGroundSettings}>Add a ground in Settings</button>}
      {([0, 1] as const).map(index => <fieldset key={index}>
        <legend>Team {index === 0 ? 'A' : 'B'}</legend>
        <label>Team name<input required readOnly={Boolean(seriesTeams)} maxLength={80} value={teams[index]} onChange={event => {
          const updated: [string, string] = [...teams]
          updated[index] = event.target.value
          setTeams(updated)
        }} /></label>
        <label>Nickname (optional)<input maxLength={40} value={nicknames[index]} onChange={event => {
          const updated: [string, string] = [...nicknames]
          updated[index] = event.target.value
          setNicknames(updated)
        }} /></label>
      </fieldset>)}
      <div className="actions">
        {!accounts && <button type="button" onClick={() => setStep('players')}>Back to players</button>}
        <button disabled={Boolean(accounts && !grounds.length)}>Continue to players</button>
      </div>
    </form></section>}
    {step === 'rosters' && <section><form onSubmit={event => {
      event.preventDefault()
      if (busy) return
      if (members.some(team => team.length < 2)) {
        setError('Assign at least two players to each team.')
        return
      }
      const form = new FormData(event.currentTarget)
      if (accounts && !ground) {
        setError('Choose a saved ground before starting.')
        setStep('teams')
        return
      }
      const overs = Number(form.get('overs'))
      if (overs > maxOvers) {
        setError('With these bowling quotas, choose fewer overs or add more players.')
        return
      }
      const sides: Match['sides'] = [members[0].map(playerName), members[1].map(playerName)]
      const roster = accounts && ([0, 1] as const).flatMap(team => members[team].map(id => ({
        user_id: id, player_name: playerName(id), team,
      })))
      if (roster?.some(member => !member.player_name)) {
        setError('Remove unavailable accounts before starting the match.')
        return
      }
      onStart({
        ground, teamNames: [teams[0].trim(), teams[1].trim()],
        teamNicknames: [nicknames[0].trim(), nicknames[1].trim()],
        sides, overs, lastMan: form.has('lastMan'), games: [[], []], innings: 0, batFirst,
      }, roster)
    }}>
      <h2>{defaults?.members.some(team => team.length) ? 'Match setup' : 'Assign players to teams'}</h2>
      {ground && <p className="muted">{ground.name}</p>}
      <p>Choose the openers before scoring. One bowler per team can bowl two overs. No bowler can bowl consecutive overs.</p>
      {accounts && <p>Choose registered players. Admins and assigned players with umpire access can score.</p>}
      {([0, 1] as const).map(index => <fieldset key={index}>
        <legend>Team {index === 0 ? 'A' : 'B'} · {nicknames[index].trim() || teams[index].trim()}</legend>
        {!editingTeams ? <p>{members[index].map(playerName).join(', ')}</p> : <>
        <ol>{members[index].map(id => <li key={id}>{playerCard(id)} <button type="button" aria-label={'Remove ' + playerName(id) + ' from team'} onClick={() => {
          const updated: [string[], string[]] = [...members]
          updated[index] = members[index].filter(member => member !== id)
          setMembers(updated)
        }}>Remove</button></li>)}</ol>
        <label>Choose player<select value={selection[index]} onChange={e => {
          const updated: [string, string] = [...selection]
          updated[index] = e.target.value
          setSelection(updated)
        }}>
          <option value="">Select a registered player</option>
          {rosterPlayers.filter(player => !(accounts ? members.flat() : members[index]).includes(player.id)).map(player => <option key={player.id} value={player.id}>{player.name}{player.nickname && player.nickname !== player.name ? ' (' + player.nickname + ')' : ''}</option>)}
        </select></label>
        <button type="button" disabled={!selection[index] || (accounts && members.flat().includes(selection[index]))} onClick={() => {
          const updated: [string[], string[]] = [...members]
          updated[index] = [...members[index], selection[index]]
          setMembers(updated)
          const cleared: [string, string] = [...selection]
          cleared[index] = ''
          setSelection(cleared)
          setError('')
        }}>Add to team</button>
        <p>{members[index].length} members assigned</p></>}
      </fieldset>)}
      {defaults?.members.some(team => team.length) && <button type="button" onClick={() => setEditingTeams(!editingTeams)}>
        {editingTeams ? 'Done editing players' : 'Edit players'}
      </button>}
      {defaults?.batFirst !== undefined && <label>Batting first<select value={batFirst ?? defaults.batFirst}
        onChange={event => setBatFirst(event.target.value === '0' ? 0 : 1)}>
        <option value={0}>{nicknames[0] || teams[0]}</option><option value={1}>{nicknames[1] || teams[1]}</option>
      </select></label>}
      <label>Overs per innings<input name="overs" type="number" value={oversInput ?? Math.min(5, maxOvers)}
        onChange={event => setOversInput(event.target.value)} min={1} max={maxOvers} required /></label>
      <label><input style={{ width: 'auto', minHeight: 0 }} type="checkbox" name="lastMan" defaultChecked={defaults?.lastMan ?? true} /> Last batter may continue alone</label>
      <div className="actions">
        <button type="button" disabled={busy} onClick={() => { setError(''); setStep('teams') }}>Back to teams</button>
        <button disabled={busy || members.some(team => team.length < 2)}>{busy ? 'Starting match…' : 'Start match'}</button>
      </div>
    </form></section>}
  </>
}
