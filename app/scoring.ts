export type Delivery = {
  kind: 'legal' | 'wide' | 'no-ball'
  batRuns: number
  physicalRuns: number
  boundary?: 4 | 6
  dismissed?: string
  bowler: string
}

export type Rules = {
  overs: number
  batters: string[]
  bowlers: string[]
  lastMan: boolean
  target?: number
}

export function formatOvers(balls: number) {
  return Math.floor(balls / 6) + '.' + balls % 6
}

function hasBowlingQuota(name: string, quota: Record<string, number>, repeatBowler?: string) {
  const balls = quota[name] ?? 0
  return balls < 6 || (balls < 12 && (repeatBowler === undefined || repeatBowler === name))
}

export function eligibleBowlers(rules: Rules, score: ReturnType<typeof replay>) {
  return rules.bowlers.filter(name => name !== score.striker && name !== score.partner
    && name !== score.previousBowler && hasBowlingQuota(name, score.quota, score.repeatBowler))
}

type BattingFigures = {
  name: string
  batted: boolean
  runs: number
  balls: number
  fours: number
  sixes: number
  dismissedBy?: string
}

type BowlingFigures = {
  name: string
  balls: number
  maidens: number
  runs: number
  wickets: number
  wides: number
  noBalls: number
}

export function replay(rules: Rules, deliveries: Delivery[]) {
  let runs = 0
  let legal = 0
  let wickets = 0
  let extras = 0
  let striker = rules.batters[0]
  let partner: string | undefined = rules.batters[1]
  let next = 2
  let currentBowler: string | undefined
  let previousBowler: string | undefined
  let repeatBowler: string | undefined
  let overRuns = 0
  const quota: Record<string, number> = Object.create(null)
  const batting = new Map<string, BattingFigures>(rules.batters.map(name => [
    name, { name, batted: false, runs: 0, balls: 0, fours: 0, sixes: 0 },
  ]))
  const bowling = new Map<string, BowlingFigures>()
  const complete = () => legal >= rules.overs * 6
    || wickets >= rules.batters.length - (rules.lastMan ? 0 : 1)
    || (rules.target !== undefined && runs >= rules.target)

  for (const ball of deliveries) {
    if (complete()) throw new Error('The innings is complete.')
    if (!rules.bowlers.includes(ball.bowler) || ball.bowler === striker || ball.bowler === partner)
      throw new Error('Choose an eligible bowler.')
    if (currentBowler && ball.bowler !== currentBowler) throw new Error('Finish the current over first.')
    if (!currentBowler && ball.bowler === previousBowler) throw new Error('Choose a different bowler for this over.')
    if (!hasBowlingQuota(ball.bowler, quota, repeatBowler))
      throw new Error('This bowler has reached their quota.')
    if (![ball.batRuns, ball.physicalRuns].every(n => Number.isSafeInteger(n) && n >= 0))
      throw new Error('Enter valid runs.')
    if (ball.kind === 'wide' && ball.batRuns !== 0) throw new Error('A wide cannot include bat runs.')
    if (ball.boundary && (ball.boundary !== ball.batRuns || ball.physicalRuns !== 0))
      throw new Error('Check the boundary and running details.')
    if (ball.dismissed && (ball.kind !== 'legal' || ![striker, partner].includes(ball.dismissed)))
      throw new Error('Choose an active batter on a legal delivery.')

    currentBowler = ball.bowler
    const extra = ball.kind === 'wide' ? 1 + ball.physicalRuns : 0
    extras += extra
    const deliveryRuns = ball.batRuns + extra
    runs += deliveryRuns
    overRuns += deliveryRuns
    const batter = batting.get(striker)!
    batter.batted = true
    if (partner) batting.get(partner)!.batted = true
    batter.runs += ball.batRuns
    if (ball.kind === 'legal') batter.balls++
    if (ball.boundary === 4) batter.fours++
    if (ball.boundary === 6) batter.sixes++

    const bowler = bowling.get(ball.bowler) ?? {
      name: ball.bowler, balls: 0, maidens: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0,
    }
    bowling.set(ball.bowler, bowler)
    bowler.runs += deliveryRuns
    if (ball.kind === 'wide') bowler.wides++
    if (ball.kind === 'no-ball') bowler.noBalls++

    if (partner && ball.physicalRuns % 2) [striker, partner] = [partner, striker]
    if (ball.dismissed) {
      wickets++
      bowler.wickets++
      batting.get(ball.dismissed)!.dismissedBy = ball.bowler
      const replacement: string | undefined = rules.batters[next++]
      if (ball.dismissed === striker) {
        striker = replacement ?? partner ?? ''
        if (!replacement) partner = undefined
      } else {
        partner = replacement
      }
    }
    if (ball.kind === 'legal') {
      legal++
      bowler.balls++
      quota[ball.bowler] = (quota[ball.bowler] ?? 0) + 1
      if (quota[ball.bowler] === 7) repeatBowler = ball.bowler
      if (legal % 6 === 0) {
        if (overRuns === 0) bowler.maidens++
        overRuns = 0
        if (partner) [striker, partner] = [partner, striker]
        previousBowler = currentBowler
        currentBowler = undefined
      }
    }
  }
  if (deliveries.length && !complete()) {
    if (striker) batting.get(striker)!.batted = true
    if (partner) batting.get(partner)!.batted = true
  }
  return {
    runs, wickets, extras, legal, striker, partner, currentBowler, previousBowler, quota, repeatBowler,
    complete: complete(), overs: formatOvers(legal), batting: [...batting.values()], bowling: [...bowling.values()],
  }
}

