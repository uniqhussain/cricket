export type Dismissal = { kind: 'bowler' | 'bowled' } | {
  kind: 'caught' | 'stumped' | 'run-out'
  fielder: string
}

export type Delivery = {
  kind: 'legal' | 'wide' | 'no-ball'
  batRuns: number
  physicalRuns: number
  boundary?: 4 | 6
  groundRun?: true
  dismissed?: string
  dismissal?: Dismissal
  chooseNextPair?: boolean
  bowler: string
}

export type Rules = {
  overs: number
  batters: string[]
  bowlers: string[]
  lastMan: boolean
  target?: number
  chooseOpeners?: boolean
  battingPairs?: Record<number, BattingPair>
  retirements?: Retirement[]
}

export type BattingPair = { striker: string; partner: string }
export type Retirement = { beforeDelivery: number; batter: string; replacement?: string }
type PendingPair = { candidates: string[]; survivor?: string }

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
  dismissal?: Dismissal
  retiredHurt?: boolean
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

type FieldingFigures = { name: string; catches: number; stumpings: number; runOuts: number }

export function replay(rules: Rules, deliveries: Delivery[]) {
  let runs = 0
  let legal = 0
  let wickets = 0
  let extras = 0
  let striker = rules.batters[0]
  let partner: string | undefined = rules.batters[1]
  const entered = new Set([striker, partner])
  const retired = new Set<string>()
  let pendingPair: PendingPair | undefined = rules.chooseOpeners ? { candidates: rules.batters } : undefined
  let currentBowler: string | undefined
  let previousBowler: string | undefined
  let repeatBowler: string | undefined
  let overRuns = 0
  const quota: Record<string, number> = Object.create(null)
  const batting = new Map<string, BattingFigures>(rules.batters.map(name => [
    name, { name, batted: false, runs: 0, balls: 0, fours: 0, sixes: 0 },
  ]))
  const bowling = new Map<string, BowlingFigures>()
  const fielding = new Map<string, FieldingFigures>()
  const complete = () => legal >= rules.overs * 6
    || wickets >= rules.batters.length - (rules.lastMan ? 0 : 1)
    || (rules.target !== undefined && runs >= rules.target)
    || (retired.size > 0 && !pendingPair && (!striker || (!rules.lastMan && !partner)))
  const availableBatters = () => rules.batters.filter(name => !entered.has(name) || retired.has(name))
  const retirements = rules.retirements ?? []
  let retirementIndex = 0

  function activate(name: string) {
    entered.add(name)
    retired.delete(name)
  }

  function selectPair(index: number) {
    const pair = rules.battingPairs?.[index]
    if (!pair) return
    if (!pendingPair || !pendingPair.candidates.includes(pair.striker) || !pendingPair.candidates.includes(pair.partner)
      || pair.striker === pair.partner
      || (pendingPair.survivor && ![pair.striker, pair.partner].includes(pendingPair.survivor))) {
      throw new Error('Choose two eligible batters and keep the surviving batter at one end.')
    }
    if (index === 0) entered.clear()
    striker = pair.striker
    partner = pair.partner
    activate(striker)
    activate(partner)
    pendingPair = undefined
  }

  function applyRetirements(index: number) {
    while (retirements[retirementIndex]?.beforeDelivery === index) {
      const { batter, replacement } = retirements[retirementIndex++]
      if (pendingPair || complete() || !batter || ![striker, partner].includes(batter))
        throw new Error('Choose an active batter to retire hurt.')
      const choices = availableBatters()
      if (replacement ? !choices.includes(replacement) : choices.length > 0)
        throw new Error('Choose an eligible replacement batter.')
      batting.get(batter)!.batted = true
      retired.add(batter)
      if (replacement) activate(replacement)
      if (batter === striker) {
        striker = replacement ?? partner ?? ''
        if (!replacement) partner = undefined
      } else partner = replacement
    }
  }

  for (const [index, ball] of deliveries.entries()) {
    selectPair(index)
    applyRetirements(index)
    if (complete()) throw new Error('The innings is complete.')
    if (pendingPair) throw new Error('Choose the striker and the batter at the other end before scoring.')
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
    if (ball.groundRun !== undefined && (ball.groundRun !== true || ball.kind !== 'legal'
      || ball.batRuns !== 1 || ball.physicalRuns !== 0 || ball.boundary || ball.dismissed))
      throw new Error('1G must be one legal ball, with one run and no running or dismissal.')
    if (ball.dismissed && (ball.kind !== 'legal' || ![striker, partner].includes(ball.dismissed)))
      throw new Error('Choose an active batter on a legal delivery.')
    if (ball.dismissal && (!ball.dismissed || (ball.dismissal.kind !== 'run-out' && ball.dismissed !== striker)))
      throw new Error('Only a run-out can dismiss the batter at the other end.')
    if (ball.dismissal && 'fielder' in ball.dismissal && !rules.bowlers.includes(ball.dismissal.fielder))
      throw new Error('Choose a fielder from the bowling team.')

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
      if (ball.dismissal?.kind !== 'run-out') bowler.wickets++
      const dismissed = batting.get(ball.dismissed)!
      dismissed.dismissedBy = ball.bowler
      dismissed.dismissal = ball.dismissal
      if (ball.dismissal && 'fielder' in ball.dismissal) {
        const { kind, fielder } = ball.dismissal
        const figures = fielding.get(fielder) ?? { name: fielder, catches: 0, stumpings: 0, runOuts: 0 }
        if (kind === 'caught') figures.catches++
        if (kind === 'stumped') figures.stumpings++
        if (kind === 'run-out') figures.runOuts++
        fielding.set(fielder, figures)
      }
      const survivor = ball.dismissed === striker ? partner : striker
      // A batter who is still retired may be picked at the next vacancy, but must not return automatically.
      const unused = availableBatters().filter(name => !retired.has(name) || Boolean(ball.chooseNextPair && survivor))
      if (ball.chooseNextPair && survivor && unused.length) {
        pendingPair = { survivor, candidates: [survivor, ...unused] }
      }
      const replacement = pendingPair ? undefined : unused[0]
      if (replacement) activate(replacement)
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
  if (complete()) pendingPair = undefined
  selectPair(deliveries.length)
  applyRetirements(deliveries.length)
  if (retirementIndex !== retirements.length) throw new Error('A retirement is outside the innings.')
  if (deliveries.length && !complete()) {
    if (striker) batting.get(striker)!.batted = true
    if (partner) batting.get(partner)!.batted = true
  }
  const battingOrder = [...[...entered].filter(name => batting.has(name)), ...rules.batters.filter(name => !entered.has(name))]
  return {
    runs, wickets, extras, legal, striker, partner, pendingPair, currentBowler, previousBowler, quota, repeatBowler,
    complete: complete(), overs: formatOvers(legal),
    batting: battingOrder.map(name => retired.has(name) ? { ...batting.get(name)!, retiredHurt: true } : batting.get(name)!),
    bowling: [...bowling.values()], fielding: [...fielding.values()],
    availableBatters: availableBatters(),
  }
}

