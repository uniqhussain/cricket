import { replay, type Delivery, type Rules } from './scoring.ts'

export type Match = {
  toss?: Toss
  startedAt?: number
  stoppedAt?: number
  finishedAt?: number
  ground?: Ground
  overs?: number
  teamNames?: [string, string]
  teamNicknames?: [string, string]
  sides: [string[], string[]]
  games: [Delivery[], Delivery[]]
  innings: 0 | 1
  lastMan: boolean
  designations: [string, string]
}
export type Ground = { id: string; name: string }
export type Toss = { winner: 0 | 1; decision: 'bat' | 'bowl' }

export function battingSide(match: Match, innings: 0 | 1): 0 | 1 {
  const toss = match.toss
  const first: 0 | 1 = toss ? (toss.decision === 'bat' ? toss.winner : oppositeSide(toss.winner)) : 0
  return innings === 0 ? first : oppositeSide(first)
}

export function oppositeSide(side: 0 | 1): 0 | 1 {
  return side === 0 ? 1 : 0
}

export function awaitingToss(match: Match) {
  return !match.toss && match.innings === 0 && !match.stoppedAt && !match.finishedAt
    && match.games.every(deliveries => deliveries.length === 0)
}

export function tossSummary(match: Match) {
  return match.toss ? teamLabel(match, match.toss.winner) + ' won the toss and chose to ' + match.toss.decision + '.' : ''
}

export function teamLabel(match: Match, side: 0 | 1) {
  return match.teamNicknames?.[side] || match.teamNames?.[side] || (side === 0 ? 'Team A' : 'Team B')
}

export function elapsedMatchSeconds(match: Match, now: number) {
  if (!match.startedAt) return 0
  return Math.max(0, Math.floor(((match.stoppedAt ?? match.finishedAt ?? now) - match.startedAt) / 1000))
}

export function updateMatchFinish(match: Match, now = Date.now()): Match {
  const finished = !match.stoppedAt && match.innings === 1 && replay(rulesFor(match, 1), match.games[1]).complete
  return { ...match, finishedAt: finished ? match.finishedAt ?? now : undefined }
}

export const accountRoles = {
  admin: 'Admin',
  umpire: 'Player with umpire access',
  player: 'Player',
} as const
export type AccountRole = keyof typeof accountRoles
export type Account = { id: string; label: string; admin: boolean; owner: boolean; player_login: boolean; disabled: boolean; role: AccountRole }

export function canUmpire(role?: AccountRole) {
  return role === 'admin' || role === 'umpire'
}
export type RosterPlayer = { user_id: string; player_name: string; team: 0 | 1 }
export type AuditEntry = {
  id: number
  actor_id: string
  action: string
  details: { operation?: string; actorName?: string; innings?: number; over?: number; delivery?: number; toss?: Toss }
  created_at: string
}
export type SharedMatch = { id: string; cricket_state: Match; revision: number; audit: AuditEntry[] }

export function rulesFor(match: Match, innings: 0 | 1): Rules {
  const side = battingSide(match, innings)
  return {
    overs: match.overs ?? 5,
    batters: match.sides[side],
    bowlers: match.sides[oppositeSide(side)],
    designated: match.designations[side],
    lastMan: match.lastMan,
    target: innings === 1 ? replay(rulesFor(match, 0), match.games[0]).runs + 1 : undefined,
  }
}

export function frozenOvers(match: Match, innings: 0 | 1) {
  let legal = 0
  let start = 0
  return match.games[innings].flatMap((ball, index) => {
    if (ball.kind !== 'legal' || ++legal % 6 !== 0) return []
    const deliveries = match.games[innings].slice(start, index + 1)
    const score = deliveries.reduce((total, item) => ({
      runs: total.runs + item.batRuns + (item.kind === 'wide' ? 1 + item.physicalRuns : 0),
      wickets: total.wickets + Number(Boolean(item.dismissed)),
    }), { runs: 0, wickets: 0 })
    const over = { innings, over_number: legal / 6, start, end: index + 1, score: { ...score, deliveries } }
    start = index + 1
    return [over]
  })
}

export type ScoreOperation =
  | { operation: 'toss'; toss: Toss }
  | { operation: 'ball'; ball: Delivery }
  | { operation: 'correct'; innings: 0 | 1; index: number; ball: Delivery }
  | { operation: 'undo' | 'chase' | 'stop' | 'timer' }

function validatedBall(ball: Delivery) {
  if (!ball || !['legal', 'wide', 'no-ball'].includes(ball.kind) || typeof ball.bowler !== 'string'
    || ![ball.batRuns, ball.physicalRuns].every(value => Number.isInteger(value) && value >= 0 && value <= 100)
    || (ball.boundary !== undefined && ball.boundary !== 4 && ball.boundary !== 6)
    || (ball.dismissed !== undefined && typeof ball.dismissed !== 'string')) throw new Error('Invalid delivery.')
  if (!ball.boundary && ball.kind !== 'wide' && ball.physicalRuns !== ball.batRuns)
    throw new Error('Physical runs must match bat runs for this delivery.')
  const { kind, bowler, batRuns, physicalRuns, boundary, dismissed } = ball
  return { kind, bowler, batRuns, physicalRuns, boundary, dismissed }
}

export function applyOperation(match: Match, input: ScoreOperation, admin: boolean) {
  if (input.operation === 'toss') {
    if (!awaitingToss(match)) throw new Error('The toss cannot be changed once it is recorded or scoring has started.')
    const { winner, decision } = input.toss ?? {}
    if ((winner !== 0 && winner !== 1) || (decision !== 'bat' && decision !== 'bowl'))
      throw new Error('Choose the toss winner and whether they elected to bat or bowl.')
    return { ...match, toss: { winner, decision }, startedAt: match.startedAt ?? Date.now() }
  }
  if (awaitingToss(match)) throw new Error('Record the toss before scoring.')
  const innings = match.innings
  const current = replay(rulesFor(match, innings), match.games[innings])
  const games: Match['games'] = [...match.games]
  if (match.stoppedAt && input.operation !== 'correct') throw new Error('The match is stopped.')
  switch (input.operation) {
    case 'ball':
      if (games[innings].length >= 1000) throw new Error('Delivery limit reached.')
      games[innings] = [...games[innings], validatedBall(input.ball)]
      break
    case 'undo': {
      const frozen = frozenOvers(match, innings).at(-1)?.end ?? 0
      if (games[innings].length <= frozen) throw new Error('This over is frozen. An admin can correct a delivery.')
      games[innings] = games[innings].slice(0, -1)
      break
    }
    case 'correct': {
      if (!admin) throw new Error('Only an admin can correct a frozen over.')
      if (input.innings !== 0 && input.innings !== 1) throw new Error('Invalid innings.')
      const index = input.index
      if (!Number.isInteger(index) || index < 0 || !frozenOvers(match, input.innings).some(over => index < over.end))
        throw new Error('Choose a delivery in a frozen over.')
      const replacement = validatedBall(input.ball)
      const previous = games[input.innings][index]
      if ((previous.kind === 'legal') !== (replacement.kind === 'legal'))
        throw new Error('The correction must preserve the over’s legal-ball count.')
      games[input.innings] = games[input.innings].map((ball, position) => position === index ? replacement : ball)
      break
    }
    case 'chase':
      if (innings !== 0 || !current.complete) throw new Error('Finish the first innings before starting the chase.')
      return { ...match, innings: 1 as const }
    case 'stop':
      if (match.finishedAt) throw new Error('The match has already finished.')
      return { ...match, stoppedAt: Date.now() }
    case 'timer':
      if (match.startedAt) throw new Error('The timer has already started.')
      return { ...match, startedAt: Date.now() }
    default:
      throw new Error('Unknown score update.')
  }
  const updated = { ...match, games }
  const first = replay(rulesFor(updated, 0), games[0])
  if (innings === 1 && !first.complete) throw new Error('This correction would reopen the first innings after the chase began.')
  if (innings === 1) replay(rulesFor(updated, 1), games[1])
  return updateMatchFinish(updated)
}
