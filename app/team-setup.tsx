'use client'

import { useEffect, useState } from 'react'
import type { Account, Match, RosterPlayer } from './match'
import { preparePlayerPhoto, uploadPlayerPhoto } from './player-photo'
import GroundSettings, { useGrounds } from './ground-settings'
import { battingHands, bowlingStyles, roles, type PlayerDetails, type Profile } from './profile'

type Player = PlayerDetails & {
  id: string
  name: string
  nickname?: string
}
const registryKey = 'turf-cricket-players-v1'

export default function TeamSetup({ onStart, accounts, profiles = [], busy }: {
  onStart: (match: Match, roster?: RosterPlayer[]) => void
  accounts?: Account[]
  profiles?: Profile[]
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
  const [teams, setTeams] = useState<[string, string]>(['', ''])
  const [members, setMembers] = useState<[string[], string[]]>([[], []])
  const [selection, setSelection] = useState<[string, string]>(['', ''])
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [step, setStep] = useState<'players' | 'teams' | 'settings'>(accounts ? 'teams' : 'players')
  const groundSettings = useGrounds()
  const [groundId, setGroundId] = useState('')

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
    <nav className="actions" aria-label="Match setup">
      {!accounts && <button onClick={() => setStep('players')} aria-pressed={step === 'players'}>Players ({players.length})</button>}
      <button onClick={() => setStep('teams')} aria-pressed={step === 'teams'}>Assign teams</button>
      <button onClick={() => setStep('settings')} aria-pressed={step === 'settings'}>Settings</button>
    </nav>
    {error && <p role="alert" className="error">{error}</p>}
    {step === 'settings' && <GroundSettings {...groundSettings} />}
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
      const teamNames: [string, string] = [teams[0].trim(), teams[1].trim()]
      if (!teamNames.every(Boolean) || teamNames[0].toLowerCase() === teamNames[1].toLowerCase()) {
        setError('Enter a different name for each team.')
        return
      }
      if (members.some(team => team.length < 2)) {
        setError('Assign at least two players to each team.')
        return
      }
      const form = new FormData(event.currentTarget)
      const ground = groundSettings.grounds.find(ground => ground.id === groundId)
      if (!ground) {
        setError('Add a ground in Settings and select it for this match.')
        return
      }
      const overs = Number(form.get('overs'))
      if (overs > Math.min(members[0].length, members[1].length) + 1) {
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
      onStart({ startedAt: Date.now(), ground: { ...ground }, teamNames, sides, overs, designations: [sides[1][0], sides[0][0]], lastMan: form.has('lastMan'), games: [[], []], innings: 0 }, roster)
    }}>
      <h2>Assign players to teams</h2>
      <label>Match ground<select required value={groundId} onChange={event => setGroundId(event.target.value)}>
        <option value="">Select ground</option>
        {groundSettings.grounds.map(ground => <option key={ground.id} value={ground.id}>{ground.name}</option>)}
      </select></label>
      {!groundSettings.grounds.length && <button type="button" onClick={() => setStep('settings')}>Add ground in Settings</button>}
      <p>Members bat in the order added. The first member can bowl two overs, and each other member one.</p>
      {accounts && <p>Choose player accounts from User settings. Every selected player can score this match.</p>}
      {([0, 1] as const).map(index => <fieldset key={index}>
        <legend>Team {index === 0 ? 'A' : 'B'}</legend>
        <label>Team name<input required maxLength={80} value={teams[index]} onChange={e => {
          const updated: [string, string] = [...teams]
          updated[index] = e.target.value
          setTeams(updated)
        }} /></label>
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
        <p>{members[index].length} members assigned</p>
      </fieldset>)}
      <label>Overs per innings<input name="overs" type="number" defaultValue={5} min={1} max={20} required /></label>
      <label><input style={{ width: 'auto', minHeight: 0 }} type="checkbox" name="lastMan" defaultChecked /> Last batter may continue alone</label>
      <button disabled={busy}>Start match</button>
    </form></section>}
  </>
}
