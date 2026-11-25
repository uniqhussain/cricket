import type { replay } from './scoring.ts'

type Innings = Pick<ReturnType<typeof replay>, 'runs' | 'legal' | 'batting' | 'bowling' | 'fielding'>
type Points = { name: string; batting: number; bowling: number; fielding: number }
type RankedPoints = Points & { total: number }

function player(rows: Map<string, Points>, name: string) {
  let points = rows.get(name)
  if (!points) {
    points = { name, batting: 0, bowling: 0, fielding: 0 }
    rows.set(name, points)
  }
  return points
}

function rank(rows: Map<string, Points>, balls: number) {
  const ranked = [...rows.values()].map(item => ({ ...item, total: item.batting + item.bowling + item.fielding }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  const leaders = ranked.filter(item => item.total === ranked[0]?.total).map(item => item.name)
  return {
    leaders,
    players: ranked.map(({ name, batting, bowling, fielding, total }): RankedPoints =>
      ({ name, batting: batting / balls, bowling: bowling / balls, fielding: fielding / balls, total: total / balls })),
  }
}

export function impactPoints(innings: (Innings | null)[]) {
  const totalBalls = innings.reduce((sum, item) => sum + (item?.legal ?? 0), 0)
  if (!totalBalls) return null
  const totalRuns = innings.reduce((sum, item) => sum + (item?.runs ?? 0), 0)
  const totals = new Map<string, Points>()
  let unspecifiedWickets = 0
  const inningsRanks = innings.map(score => {
    if (!score) return null
    const rows = new Map<string, Points>()
    // Keep integer numerators until ranking. Equal scores stay tied even when rates are fractional.
    for (const batter of score.batting) {
      if (batter.dismissedBy && !batter.dismissal) unspecifiedWickets++
      if (batter.batted) player(rows, batter.name).batting = batter.runs * totalBalls - batter.balls * totalRuns
    }
    for (const bowler of score.bowling)
      player(rows, bowler.name).bowling = (bowler.balls + 6 * bowler.wickets) * totalRuns - bowler.runs * totalBalls
    for (const fielder of score.fielding)
      player(rows, fielder.name).fielding = 2 * (fielder.catches + fielder.stumpings) * totalBalls + 6 * fielder.runOuts * totalRuns
    for (const item of rows.values()) {
      const total = player(totals, item.name)
      total.batting += item.batting
      total.bowling += item.bowling
      total.fielding += item.fielding
    }
    return rank(rows, totalBalls)
  })
  return {
    runsPerBall: totalRuns / totalBalls,
    wicketValue: 6 * totalRuns / totalBalls,
    unspecifiedWickets,
    innings: inningsRanks,
    match: rank(totals, totalBalls),
  }
}

export function formatPoints(points: number) {
  const magnitude = Math.abs(points).toFixed(1)
  return magnitude === '0.0' ? magnitude : (points > 0 ? '+' : '−') + magnitude
}
