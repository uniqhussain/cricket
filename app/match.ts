import { replay, type Delivery, type Rules } from './scoring.ts'

export type Match = {
  startedAt?: number
  stoppedAt?: number
  ground?: { id: string; name: string }
  overs?: number
  teamNames?: [string, string]
  sides: [string[], string[]]
  games: [Delivery[], Delivery[]]
  innings: 0 | 1
  lastMan: boolean
  designations: [string, string]
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
  details: { operation?: string; actorName?: string; innings?: number; over?: number; delivery?: number }
  created_at: string
}
export type SharedMatch = { id: string; cricket_state: Match; revision: number; audit: AuditEntry[] }

export function rulesFor(match: Match, innings: 0 | 1): Rules {
  return {
    overs: match.overs ?? 5,
    batters: match.sides[innings],
    bowlers: match.sides[1 - innings],
    designated: match.designations[innings],
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
  return updated
}
