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
  designated: string
  lastMan: boolean
  target?: number
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
  const quota: Record<string, number> = Object.create(null)
  const complete = () => legal >= rules.overs * 6
    || wickets >= rules.batters.length - (rules.lastMan ? 0 : 1)
    || (rules.target !== undefined && runs >= rules.target)

  for (const ball of deliveries) {
    if (complete()) throw new Error('The innings is complete.')
    if (!rules.bowlers.includes(ball.bowler) || ball.bowler === striker || ball.bowler === partner)
      throw new Error('Choose an eligible bowler.')
    if (currentBowler && ball.bowler !== currentBowler) throw new Error('Finish the current over first.')
    if (!currentBowler && ball.bowler === previousBowler) throw new Error('Choose a different bowler for this over.')
    if ((quota[ball.bowler] ?? 0) >= (ball.bowler === rules.designated ? 12 : 6))
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
    runs += ball.batRuns + extra
    if (partner && ball.physicalRuns % 2) [striker, partner] = [partner, striker]
    if (ball.dismissed) {
      wickets++
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
      quota[ball.bowler] = (quota[ball.bowler] ?? 0) + 1
      if (legal % 6 === 0) {
        if (partner) [striker, partner] = [partner, striker]
        previousBowler = currentBowler
        currentBowler = undefined
      }
    }
  }
  return { runs, wickets, extras, legal, striker, partner, currentBowler, previousBowler, quota, complete: complete(), overs: Math.floor(legal / 6) + '.' + legal % 6 }
}

