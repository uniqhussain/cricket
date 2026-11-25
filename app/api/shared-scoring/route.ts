import { signedInUser } from '../photo-session/auth'
import { applyOperation, canUmpire, frozenOvers, matchWinner, teamLabel, type Account, type AccountRole, type AuditEntry, type Ground, type Match, type MatchPosterMetadata, type RosterPlayer, type ScoreOperation } from '../../match'
import type { Series } from '../../series'
import { loginIdentifier, minPasswordLength, playerUsername } from '../../player-login'
import { validatePlayerDetails, type PlayerDetails, type Profile } from '../../profile'
import { ownsPhotoLink } from '../player-photos/photo-link'

type MatchRow = {
  id: string; name: string; status: string; cricket_state: Match; revision: number; updated_at: string
  created_at: string; series_id: string | null
  cricket_series?: { name: string; started_at: string; ended_at: string | null } | null
}
const profileFields = 'user_id,name,nickname,details'
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new RequestError('Shared scoring is not configured on this deployment.', 503)
  return { url, headers: {
    apikey: key, 'Content-Type': 'application/json',
    ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }),
  } }
}

async function db<T>(path: string, method = 'GET', body?: unknown, prefer?: string): Promise<T> {
  const { url, headers } = supabaseConfig()
  const response = await fetch(url + '/rest/v1/' + path, {
    method, cache: 'no-store',
    headers: {
      ...headers,
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (data?.code === '42501') throw new RequestError('You do not have permission for this action.', 403)
    if (data?.code === '40001') throw new RequestError('Someone updated this match. Check the latest score before trying again.', 409)
    if (data?.code === '22023') throw new RequestError(data.message, 400)
    if (data?.code === 'P0002') throw new RequestError('Match not found.', 404)
    console.error('Shared scoring database request failed', response.status, data?.code)
    throw new RequestError('Shared scoring is temporarily unavailable.', 503)
  }
  return data as T
}

async function authAdmin(path: string, method: string, body?: object) {
  const { url, headers } = supabaseConfig()
  const response = await fetch(url + '/auth/v1/admin/users' + path, {
    method, headers, cache: 'no-store', body: body && JSON.stringify(body),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 422 || response.status === 400)
      throw new RequestError('The user ID may already exist, or the password does not meet the project rules.', 400)
    throw new RequestError('Could not update the login.', 503)
  }
  return result
}

function rpc<T>(name: string, body: object) { return db<T>('rpc/' + name, 'POST', body) }

async function session() {
  const user = await signedInUser()
  if (!user) return null
  const identity = await rpc<{ admin: boolean; role: AccountRole } | null>('cricket_identity', { actor: user.id })
  return identity ? { ...user, ...identity } : null
}

function errorResponse(error: unknown) {
  if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status })
  return Response.json({ error: 'Shared scoring is temporarily unavailable.' }, { status: 503 })
}

async function loadMatch(id: string, user: { id: string; admin: boolean }) {
  if (!uuid.test(id)) throw new RequestError('Match not found.', 404)
  if (!user.admin) {
    const memberships = await db<RosterPlayer[]>('match_players?select=user_id&match_id=eq.' + id + '&user_id=eq.' + user.id)
    if (!memberships.length) throw new RequestError('Match not found.', 404)
  }
  const [match] = await db<MatchRow[]>('matches?select=id,name,status,cricket_state,revision,created_at,updated_at,series_id,cricket_series(name,started_at,ended_at)&cricket_state=not.is.null&archived_at=is.null&id=eq.' + id)
  if (!match) throw new RequestError('Match not found.', 404)
  if (match.status === 'complete' && !match.cricket_state.finishedAt) {
    match.cricket_state = { ...match.cricket_state, finishedAt: Date.parse(match.updated_at) }
  }
  return match
}

async function chronologicalNumber(table: string, column: string, time: string, id: string, filters = '') {
  const { url, headers } = supabaseConfig()
  const timestamp = encodeURIComponent(time)
  // Include archived matches so removing an old match does not renumber the series.
  const before = '&or=(' + column + '.lt.' + timestamp + ',and(' + column + '.eq.' + timestamp + ',id.lt.' + id + '))'
  const response = await fetch(url + '/rest/v1/' + table + '?select=id' + filters + before, {
    method: 'HEAD', cache: 'no-store', headers: { ...headers, Prefer: 'count=exact' },
  })
  const count = response.headers.get('content-range')?.split('/')[1]
  return response.ok && count && /^\d+$/.test(count) ? Number(count) + 1 : undefined
}

async function posterMetadata(match: MatchRow): Promise<MatchPosterMetadata> {
  const createdAt = match.created_at
  const series = match.cricket_series
  if (!series || !match.series_id || !match.cricket_state.finishedAt) return { createdAt }
  const [number, matchNumber] = await Promise.all([
    chronologicalNumber('cricket_series', 'started_at', series.started_at, match.series_id),
    chronologicalNumber('matches', 'created_at', createdAt, match.id, '&series_id=eq.' + match.series_id),
  ].map(request => request.catch(() => undefined)))
  return { createdAt, series: { name: series.name, number, matchNumber } }
}

async function matchDetails(match: MatchRow) {
  const [audit, poster_metadata] = await Promise.all([
    db<AuditEntry[]>('score_audit?select=id,actor_id,action,details,created_at&order=id.desc&limit=100&match_id=eq.' + match.id),
    posterMetadata(match),
  ])
  const { cricket_series: series, ...details } = match
  return { ...details, series_ended_at: series?.ended_at ?? null, audit, poster_metadata }
}

export async function GET(request: Request) {
  try {
    const user = await session()
    const params = new URL(request.url).searchParams
    if (!user && (params.has('match') || params.has('users'))) throw new RequestError('Sign in to continue.', 401)
    if (!user) return Response.json({ user: null, matches: [], series: [], configured: Boolean(
      process.env.SUPABASE_URL && (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)
      && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
    ) })
    const id = params.get('match')
    if (id) return Response.json({ match: await matchDetails(await loadMatch(id, user)), user })
    if (params.has('users')) {
      if (!user.admin) throw new RequestError('Admin access required.', 403)
      const [accounts, profiles, grounds] = await Promise.all([
        rpc<Account[]>('cricket_accounts_with_roles', { actor: user.id }),
        db<Profile[]>('cricket_profiles?select=' + profileFields),
        db<Ground[]>('cricket_grounds?select=id,name&order=name.asc'),
      ])
      return Response.json({ accounts, profiles, grounds })
    }
    const [profile] = await db<Profile[]>('cricket_profiles?select=' + profileFields + '&user_id=eq.' + user.id)
    const rows = user.admin ? null : await db<{ match_id: string }[]>('match_players?select=match_id&user_id=eq.' + user.id)
    const matches = rows?.length === 0 ? [] : await db<MatchRow[]>(
      'matches?select=id,name,status,series_id&cricket_state=not.is.null&archived_at=is.null&order=updated_at.desc&limit=100'
      + (rows ? '&id=in.(' + rows.map(row => row.match_id).join(',') + ')' : ''),
    )
    const series = await rpc<Series[]>('cricket_series_directory', { actor: user.id })
    return Response.json({ user, matches, series, profile: profile ?? null })
  } catch (error) { return errorResponse(error) }
}

function createState(raw: Match, suppliedRoster: RosterPlayer[], ground: Ground) {
  if (!raw || !Array.isArray(suppliedRoster) || !Array.isArray(raw.sides) || raw.sides.length !== 2
    || !Array.isArray(raw.teamNames) || raw.teamNames.length !== 2
    || !Number.isInteger(raw.overs) || raw.overs! < 1 || raw.overs! > 20
    || typeof raw.lastMan !== 'boolean') throw new RequestError('Check the match setup.', 400)
  const validName = (value: unknown) => typeof value === 'string' && value.trim() && value.length <= 80
  if (raw.teamNicknames !== undefined && (!Array.isArray(raw.teamNicknames) || raw.teamNicknames.length !== 2
    || !raw.teamNicknames.every(name => typeof name === 'string' && name.length <= 40)))
    throw new RequestError('Team nicknames can be up to 40 characters.', 400)
  if (!raw.teamNames.every(validName) || raw.teamNames[0].trim().toLowerCase() === raw.teamNames[1].trim().toLowerCase()
    || !raw.sides.every(side => Array.isArray(side) && side.length >= 2 && side.length <= 30
      && side.every(validName) && raw.overs! <= side.length + 1))
    throw new RequestError('Check the team names, players and overs.', 400)
  const names = raw.sides.flat().map(name => name.trim())
  if (new Set(names.map(name => name.toLowerCase())).size !== names.length || suppliedRoster.length !== names.length)
    throw new RequestError('Use a different player for each roster slot.', 400)
  const roster = raw.sides.flatMap((side, team) => side.map(player => {
    const entry = suppliedRoster.find(item => item?.team === team && item.player_name === player)
    if (!entry || typeof entry.user_id !== 'string' || !uuid.test(entry.user_id))
      throw new RequestError('Link every player to a verified account.', 400)
    return { user_id: entry.user_id.toLowerCase(), team, player_name: player.trim() }
  }))
  if (new Set(roster.map(entry => entry.user_id)).size !== names.length)
    throw new RequestError('Each match player needs a different account.', 400)
  const sides: Match['sides'] = [raw.sides[0].map(name => name.trim()), raw.sides[1].map(name => name.trim())]
  const state: Match = {
    sides, games: [[], []], innings: 0, overs: raw.overs, lastMan: raw.lastMan,
    ground,
    teamNames: [raw.teamNames[0].trim(), raw.teamNames[1].trim()],
    teamNicknames: raw.teamNicknames && [raw.teamNicknames[0].trim(), raw.teamNicknames[1].trim()],
  }
  if (teamLabel(state, 0).toLowerCase() === teamLabel(state, 1).toLowerCase())
    throw new RequestError('Use a different display name for each team.', 400)
  return { state, roster }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new RequestError('Use the cricket app.', 403)
    const user = await session()
    if (!user) throw new RequestError('Sign in to continue.', 401)
    const body = await request.json().catch(() => null)
    if (!body || typeof body.operation !== 'string') throw new RequestError('Invalid request.', 400)
    if (body.operation === 'startSeries' || body.operation === 'endSeries') {
      if (!user.admin) throw new RequestError('Only admins can start or end a series.', 403)
      if (body.operation === 'endSeries') {
        if (typeof body.seriesId !== 'string' || !uuid.test(body.seriesId)) throw new RequestError('Choose a series.', 400)
        await rpc('cricket_end_series', { actor: user.id, series_key: body.seriesId })
        return Response.json({ id: body.seriesId })
      }
      const names = [body.name, body.teamA, body.teamB].map(value => typeof value === 'string' ? value.trim() : '')
      if (names.some(value => !value || value.length > 80)) throw new RequestError('Enter a series name and both team names (up to 80 characters each).', 400)
      const [name, teamA, teamB] = names
      if (teamA.toLowerCase() === teamB.toLowerCase()) throw new RequestError('Use two different team names.', 400)
      const id = await rpc<string>('cricket_start_series', { actor: user.id, series_name: name, first_team: teamA, second_team: teamB })
      return Response.json({ id }, { status: 201 })
    }
    if (body.operation === 'addGround') {
      if (!user.admin) throw new RequestError('Only admins can add grounds.', 403)
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120)
        throw new RequestError('Enter a ground name of up to 120 characters.', 400)
      const ground = await rpc<Ground>('cricket_add_ground', { actor: user.id, ground_name: body.name.trim() })
      return Response.json({ ground }, { status: 201 })
    }
    if (['createPlayer', 'createLogin', 'resetLogin', 'disableLogin'].includes(body.operation)) {
      if (!user.admin) throw new RequestError('Admin access required.', 403)
      if (body.operation !== 'disableLogin') {
        if (typeof body.password !== 'string' || body.password.length < minPasswordLength)
          throw new RequestError('Use at least ' + minPasswordLength + ' characters for the password.', 400)
        if (new TextEncoder().encode(body.password).length > 72)
          throw new RequestError('The password is too long. Use up to 72 bytes.', 400)
      }
      if (body.operation === 'createPlayer') {
        const role = body.role === undefined ? 'player' : body.role
        if (role !== 'player' && role !== 'umpire' && role !== 'admin')
          throw new RequestError('Choose Player, Player with umpire access, or Admin.', 400)
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
        if (!name || name.length > 80) throw new RequestError('Enter a player name of up to 80 characters.', 400)
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('.invalid'))
          throw new RequestError('Enter a valid player email address.', 400)
        const created = await authAdmin('', 'POST', {
          email, password: body.password, email_confirm: true, app_metadata: { cricket_player: true },
        })
        if (typeof created?.id !== 'string' || !uuid.test(created.id))
          throw new RequestError('Check Manage users to see whether the login was created before retrying.', 503)
        try {
          await db('cricket_profiles?on_conflict=user_id', 'POST', {
            user_id: created.id, name, nickname: '',
          }, 'resolution=ignore-duplicates')
          if (role !== 'player') await rpc('cricket_set_role', { actor: user.id, target: created.id, new_role: role })
        } catch {
          throw new RequestError('The login was created. Check the name and account role in Manage users before retrying.', 503)
        }
      } else if (body.operation === 'createLogin') {
        const role = body.role === undefined ? 'player' : body.role
        if (role !== 'admin' && role !== 'player') throw new RequestError('Choose Admin or Player.', 400)
        const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
        if (!playerUsername.test(username))
          throw new RequestError('Use 3–40 letters, digits, dots, underscores or hyphens for the user ID.', 400)
        const created = await authAdmin('', 'POST', {
          ...loginIdentifier(username), password: body.password, email_confirm: true, app_metadata: { cricket_player: true },
        })
        if (role === 'admin') {
          if (typeof created?.id !== 'string' || !uuid.test(created.id))
            throw new RequestError('Check User settings to see whether the login was created before retrying.', 503)
          try {
            await rpc('cricket_set_admin', { actor: user.id, target: created.id, enabled: true })
          } catch {
            throw new RequestError('The login was created. Check its role in User settings and select Admin if needed.', 503)
          }
        }
      } else {
        if (typeof body.target !== 'string' || !uuid.test(body.target)) throw new RequestError('Choose a player login.', 400)
        const accounts = await rpc<Account[]>('cricket_accounts', { actor: user.id })
        const account = accounts.find(item => item.id === body.target)
        if (!account || account.admin || account.owner || !account.player_login || account.id === user.id)
          throw new RequestError('Choose a non-admin player login.', 400)
        if (body.operation === 'disableLogin' && typeof body.disabled !== 'boolean') throw new RequestError('Invalid login status.', 400)
        await authAdmin('/' + account.id, 'PUT', body.operation === 'disableLogin'
          ? { ban_duration: body.disabled ? '876000h' : 'none' } : { password: body.password })
      }
      return Response.json({ ok: true })
    }
    if (body.operation === 'role') {
      if (!user.admin || typeof body.target !== 'string' || !uuid.test(body.target))
        throw new RequestError('Admin access and a valid account are required.', 403)
      const role = body.role ?? (typeof body.enabled === 'boolean' ? body.enabled ? 'admin' : 'player' : undefined)
      if (!['admin', 'umpire', 'player'].includes(role)) throw new RequestError('Choose a valid account role.', 400)
      await rpc('cricket_set_role', { actor: user.id, target: body.target, new_role: role })
      return Response.json({ ok: true })
    }
    if (body.operation === 'profile' || body.operation === 'removeProfile') {
      const target = body.target ?? user.id
      if (typeof target !== 'string' || !uuid.test(target) || (!user.admin && target !== user.id)
        || (body.operation === 'removeProfile' && !user.admin))
        throw new RequestError('You do not have permission to change this profile.', 403)
      if (target !== user.id && !(await rpc<Account[]>('cricket_accounts', { actor: user.id })).some(account => account.id === target))
        throw new RequestError('Choose a verified account.', 400)
      if (body.operation === 'removeProfile') {
        await db('cricket_profiles?user_id=eq.' + target, 'DELETE')
      } else {
        if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 80
          || typeof body.nickname !== 'string' || body.nickname.length > 40)
          throw new RequestError('Enter a name and an optional nickname.', 400)
        let details: PlayerDetails | undefined
        if (body.details !== undefined) {
          try { details = validatePlayerDetails(body.details) }
          catch (error) { throw new RequestError(error instanceof Error ? error.message : 'Check your player details.', 400) }
          const photo = body.details.photo
          if (photo === '') details.photo = undefined
          else if (photo !== undefined) {
            if (typeof photo !== 'string' || photo.length > 512) throw new RequestError('Choose a valid profile photo.', 400)
            const [current] = await db<Pick<Profile, 'details'>[]>('cricket_profiles?select=details&user_id=eq.' + target)
            if (current?.details.photo !== photo && !ownsPhotoLink(photo, user.id, process.env.BLOB_READ_WRITE_TOKEN))
              throw new RequestError('Upload a new photo from your profile.', 400)
            details.photo = photo
          } else {
            const [current] = await db<Pick<Profile, 'details'>[]>('cricket_profiles?select=details&user_id=eq.' + target)
            details.photo = current?.details.photo
          }
        }
        await db('cricket_profiles?on_conflict=user_id', 'POST', {
          user_id: target, name: body.name.trim(), nickname: body.nickname.trim(), updated_at: new Date().toISOString(),
          ...(details ? { details } : {}),
        }, 'resolution=merge-duplicates')
      }
      return Response.json({ ok: true })
    }
    if (body.operation === 'create') {
      if (!user.admin) throw new RequestError('Only an admin can set up a shared match.', 403)
      if (typeof body.seriesId !== 'string' || !uuid.test(body.seriesId)) throw new RequestError('Start or choose an active series first.', 400)
      const groundId = body.match?.ground?.id
      if (typeof groundId !== 'string' || !uuid.test(groundId)) throw new RequestError('Choose a saved ground.', 400)
      const [ground] = await db<Ground[]>('cricket_grounds?select=id,name&id=eq.' + groundId)
      if (!ground) throw new RequestError('Choose a saved ground from Settings.', 400)
      const { state, roster } = createState(body.match, body.roster, ground)
      const id = await rpc<string>('cricket_create_series_match', {
        actor: user.id, series_key: body.seriesId, title: teamLabel(state, 0) + ' vs ' + teamLabel(state, 1), state, roster,
      })
      return Response.json({ match: await matchDetails(await loadMatch(id, user)) }, { status: 201 })
    }
    if (typeof body.id !== 'string' || !Number.isInteger(body.revision)) throw new RequestError('Invalid match update.', 400)
    const match = await loadMatch(body.id, user)
    if (match.cricket_series?.ended_at) throw new RequestError('This series has ended. Its results are final.', 400)
    if (!canUmpire(user.role)) throw new RequestError('Only admins and match umpires can update scores.', 403)
    if (body.revision !== match.revision) throw new RequestError('Someone updated this match. Check the latest score before trying again.', 409)
    if (body.operation === 'correct' && !user.admin) throw new RequestError('Only an admin can correct a frozen over.', 403)
    let state: Match
    try { state = applyOperation(match.cricket_state, body as ScoreOperation, user.admin) }
    catch (error) { throw new RequestError(error instanceof Error ? error.message : 'Invalid score update.', 400) }
    const [member] = await db<RosterPlayer[]>('match_players?select=player_name&match_id=eq.' + match.id + '&user_id=eq.' + user.id)
    const [profile] = await db<Profile[]>('cricket_profiles?select=name&user_id=eq.' + user.id)
    const event = {
      operation: body.operation, actorName: member?.player_name || profile?.name || (user.admin ? 'Admin ' : 'Umpire ') + user.id.slice(0, 8),
      innings: body.operation === 'correct' ? body.innings : match.cricket_state.innings,
      ...(body.operation === 'toss' ? { toss: state.toss }
        : body.operation === 'batters' ? { pair: state.battingPairs?.[state.innings][state.games[state.innings].length] }
        : body.operation === 'correct' ? {
        delivery: body.index + 1, before: match.cricket_state.games[body.innings as 0 | 1][body.index],
        after: state.games[body.innings as 0 | 1][body.index],
      } : body.operation === 'ball' ? { delivery: state.games[state.innings].length, after: state.games[state.innings].at(-1) }
        : body.operation === 'undo' ? { delivery: match.cricket_state.games[state.innings].length, before: match.cricket_state.games[state.innings].at(-1) } : {}),
    }
    await rpc('cricket_save_match_result', {
      actor: user.id, match_key: match.id, expected_revision: body.revision, state,
      match_status: state.stoppedAt ? 'stopped' : state.finishedAt ? 'complete' : 'live',
      event, frozen: [0 as const, 1 as const].flatMap(innings => frozenOvers(state, innings)), admin_only: body.operation === 'correct',
      winner: state.finishedAt ? matchWinner(state) : null,
    })
    return Response.json({ match: await matchDetails(await loadMatch(match.id, user)) })
  } catch (error) { return errorResponse(error) }
}
