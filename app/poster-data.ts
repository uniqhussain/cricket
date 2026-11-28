import { formatPoints, impactPoints } from './impact.ts'
import { battingSide, matchWinner, oppositeSide, rulesFor, teamLabel, type Match, type MatchPosterMetadata } from './match.ts'
import { formatOvers, replay, type Delivery } from './scoring.ts'

type InningsScore = ReturnType<typeof replay>
export const battingColumns = ['Batter', 'R', 'B', '4s', '6s', 'SR']
export const bowlingColumns = ['Bowler', 'O', 'M', 'R', 'W', 'WD', 'NB', 'Econ']
export const impactColumns = ['Player', 'Bat', 'Bowl', 'Field', 'Total']

export function battingStatus(batter: InningsScore['batting'][number]) {
  if (batter.dismissal?.kind === 'run-out') return 'Run-out · ' + batter.dismissal.fielder
  return batter.dismissedBy ? 'Out · ' + batter.dismissedBy : batter.batted ? 'Not out' : 'Did not bat'
}

export function battingCells(batter: InningsScore['batting'][number]) {
  return [
    ...[batter.runs, batter.balls, batter.fours, batter.sixes].map(value => batter.batted ? String(value) : '—'),
    batter.balls ? (batter.runs * 100 / batter.balls).toFixed(1) : '—',
  ]
}

export function bowlingCells(bowler: InningsScore['bowling'][number]) {
  return [formatOvers(bowler.balls), ...[bowler.maidens, bowler.runs, bowler.wickets, bowler.wides, bowler.noBalls].map(String),
    bowler.balls ? (bowler.runs * 6 / bowler.balls).toFixed(1) : '—']
}

export type PosterTable = {
  id: 'batting' | 'bowling' | 'awards' | 'impact'
  title: string
  columns: string[]
  rows: string[][]
  rowNotes?: Record<string, string>
  continued?: boolean
}
export type PosterSection = {
  title: string
  innings?: { battingTeam: string; score: string; overs: string; extras: number }
  award?: { label: string; points: string; baselines: string; performance?: string[] }
  note?: string
  tables: PosterTable[]
}
export type PosterSelection = 0 | 1 | 'impact'
type PosterPage = { teams: [string, string]; metadata: string[]; result: string; sections: PosterSection[]; label?: string; matchNumber?: number }
export type PosterData = PosterPage & { text: string }

function verifyInnings(score: InningsScore, deliveries: Delivery[]) {
  const legal = deliveries.filter(ball => ball.kind === 'legal').length
  const wickets = deliveries.filter(ball => ball.dismissed).length
  const extras = (ball: Delivery) => ball.kind === 'wide' ? 1 + ball.physicalRuns : 0
  const sum = <T,>(rows: T[], value: (row: T) => number) => rows.reduce((total, row) => total + value(row), 0)
  if (!score.complete || score.legal !== legal || score.overs !== formatOvers(legal) || score.wickets !== wickets
    || score.extras !== sum(deliveries, extras)
    || score.runs !== sum(score.batting, batter => batter.runs) + score.extras
    || score.wickets !== score.batting.filter(batter => batter.dismissedBy).length
    || score.legal !== sum(score.batting, batter => batter.balls)
    || score.bowling.length !== new Set(deliveries.map(ball => ball.bowler)).size
    || score.runs !== sum(score.bowling, bowler => bowler.runs)) throw new Error('The innings totals do not reconcile.')

  for (const bowler of score.bowling) {
    const balls = deliveries.filter(ball => ball.bowler === bowler.name)
    let overBalls = 0
    let overRuns = 0
    let maidens = 0
    for (const ball of balls) {
      overRuns += ball.batRuns + extras(ball)
      if (ball.kind === 'legal' && ++overBalls === 6) {
        if (overRuns === 0) maidens++
        overRuns = 0
        overBalls = 0
      }
    }
    if (!balls.length || bowler.balls !== balls.filter(ball => ball.kind === 'legal').length
      || bowler.maidens !== maidens || bowler.runs !== sum(balls, ball => ball.batRuns + extras(ball))
      || bowler.wickets !== balls.filter(ball => ball.dismissed && ball.dismissal?.kind !== 'run-out').length
      || bowler.wides !== balls.filter(ball => ball.kind === 'wide').length
      || bowler.noBalls !== balls.filter(ball => ball.kind === 'no-ball').length) {
      throw new Error('The bowling figures do not reconcile.')
    }
  }
}

function resultFor(match: Match, first: InningsScore, chase: InningsScore) {
  const difference = first.runs - chase.runs
  const side = difference === 0 ? null : battingSide(match, difference > 0 ? 0 : 1)
  if (matchWinner(match) !== side) throw new Error('The winning team does not match the innings totals.')
  if (side === null) return 'Match tied'
  const wicketsLeft = match.sides[side].length - (match.lastMan ? 0 : 1) - chase.wickets
  const margin = difference > 0 ? difference : wicketsLeft
  if (margin < 1) throw new Error('The winning margin could not be verified.')
  const unit = difference > 0 ? 'run' : 'wicket'
  return teamLabel(match, side) + ' won by ' + margin + ' ' + unit + (margin === 1 ? '' : 's')
}

function makeText({ teams, metadata, result, sections }: PosterPage) {
  return ['TURF CRICKET', ...metadata, teams.join(' vs '), result, ...sections.flatMap(section => [
    '', section.title,
    ...(section.innings ? [section.innings.battingTeam + ' · ' + section.innings.score + ' in ' + section.innings.overs
      + ' overs · Extras ' + section.innings.extras] : []),
    ...(section.award ? [section.award.label + ' (' + section.award.points + ')',
      ...(section.award.performance ?? []), section.award.baselines] : []),
    ...section.tables.flatMap(table => [table.title, table.columns.join(' | '), ...table.rows.map(row => row.join(' | '))]),
    ...(section.note ? [section.note] : []),
  ])].join('\n')
}

export function buildPosterData(match: Match, source?: MatchPosterMetadata, selection?: PosterSelection): PosterData {
  const finished = Boolean(match.finishedAt && !match.stoppedAt && match.innings === 1)
  if (!finished && selection === undefined) throw new Error('Finish both innings to generate a match poster.')
  const scores = ([0, 1] as const).map(index => {
    try {
      const score = replay(rulesFor(match, index), match.games[index])
      if (finished) verifyInnings(score, match.games[index])
      return score
    } catch (error) {
      throw new Error('Innings ' + (index + 1) + ' could not be verified. ' + (error instanceof Error ? error.message : 'Check the saved deliveries.'))
    }
  })
  const result = finished ? resultFor(match, scores[0], scores[1]) : match.stoppedAt ? 'Match stopped' : 'Match in progress'
  const date = new Date(match.startedAt ?? source?.createdAt ?? NaN)
  const dateLabel = Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : ''
  const series = source?.series
  const metadata = [
    [series?.number ? 'Series ' + series.number : '', series?.matchNumber ? 'Match ' + series.matchNumber : '', series?.name].filter(Boolean).join(' · '),
    [dateLabel, match.ground?.name].filter(Boolean).join(' · '),
  ].filter(Boolean)
  const sections: PosterSection[] = scores.map((score, index) => {
    const side = battingSide(match, index === 0 ? 0 : 1)
    const battingTeam = teamLabel(match, side)
    const bowlingTeam = teamLabel(match, oppositeSide(side))
    return {
      title: index === 0 ? 'First innings' : 'Second innings',
      innings: { battingTeam, score: score.runs + '/' + score.wickets, overs: score.overs, extras: score.extras },
      tables: [
        { id: 'batting', title: battingTeam + ' batting', columns: battingColumns,
          rows: score.batting.map(batter => [batter.name, ...battingCells(batter)]),
          rowNotes: selection === index ? Object.fromEntries(score.batting.map(batter => [batter.name, battingStatus(batter)])) : undefined },
        { id: 'bowling', title: bowlingTeam + ' bowling', columns: bowlingColumns,
          rows: score.bowling.map(bowler => [bowler.name, ...bowlingCells(bowler)]) },
      ],
    }
  })
  const impact = impactPoints(scores)
  const leaders = impact?.match.leaders ?? []
  if (impact && leaders.length) {
    const performances = leaders.map(name => {
      const batter = scores.flatMap(score => score.batting).find(row => row.name === name && row.batted)
      const bowler = scores.flatMap(score => score.bowling).find(row => row.name === name)
      return [name, batter ? batter.runs + ' runs · ' + batter.balls + ' balls' : 'Did not bat',
        bowler ? bowler.wickets + '/' + bowler.runs + ' · ' + formatOvers(bowler.balls) + ' overs' : 'Did not bowl']
    })
    const title = finished ? (leaders.length === 1 ? 'Player of the Match' : 'Joint Players of the Match')
      : match.stoppedAt ? 'Impact leader at stoppage' : 'Current match leader'
    const award = {
      label: leaders.length === 1 ? title + ' · ' + leaders[0] : title,
      points: formatPoints(impact.match.players[0].total),
      baselines: impact.runsPerBall.toFixed(2) + ' runs per legal ball · ' + impact.wicketValue.toFixed(2) + ' points per wicket',
      performance: leaders.length === 1 ? ['Batting ' + performances[0][1], 'Bowling ' + performances[0][2]] : undefined,
    }
    sections.push({
      title: 'Impact Points', award,
      note: impact.unspecifiedWickets ? 'Fielding points use recorded dismissal details.' : undefined,
      tables: [
        ...(leaders.length > 1 ? [{ id: 'awards' as const, title: 'Impact leaders’ performance',
          columns: ['Player', 'Batting', 'Bowling'], rows: performances }] : []),
        { id: 'impact', title: 'Match impact by player', columns: impactColumns,
          rows: impact.match.players.map(item => [item.name, ...[item.batting, item.bowling, item.fielding, item.total].map(formatPoints)]) },
      ],
    })
  } else {
    sections.push({ title: 'Impact Points', note: 'Impact Points require at least one legal ball.', tables: [] })
  }
  if (typeof selection === 'number' && !match.games[selection].length) throw new Error('No deliveries were recorded for this innings.')
  const selectedSections = selection === undefined ? sections : [selection === 'impact' ? sections[2] : sections[selection]]
  const label = selection === undefined ? undefined : selection === 'impact' ? 'Match impact' : 'Innings scorecard'
  const data: PosterPage = {
    teams: [teamLabel(match, 0), teamLabel(match, 1)], metadata, result, sections: selectedSections, label,
    matchNumber: selection === undefined ? series?.matchNumber : undefined,
  }
  return { ...data, text: makeText(data) }
}
