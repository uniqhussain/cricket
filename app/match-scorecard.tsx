import { useMemo } from 'react'
import { battingSide, oppositeSide, rulesFor, teamLabel, tossSummary, type Match, type MatchPosterMetadata } from './match'
import { formatOvers, replay } from './scoring'
import { formatPoints, impactPoints } from './impact'
import CopyScoreImage from './copy-score-image'
import { battingCells, battingColumns, battingStatus, bowlingCells, bowlingColumns, impactColumns } from './poster-data'

export function LiveFigures({ score, bowler }: { score: ReturnType<typeof replay>; bowler: string }) {
  const batters = score.batting.filter(batter => [score.striker, score.partner].includes(batter.name))
  const currentBowler = bowler || score.previousBowler
  const figures = score.bowling.find(item => item.name === currentBowler)
  return <section aria-label="Live batting and bowling figures">
    <h2>Live player figures</h2>
    {!score.pendingPair && <div className="scorecard-table">
      <table>
        <caption>Batters at the crease</caption>
        <thead><tr><th scope="col">Batter</th><th scope="col">R</th><th scope="col">B</th><th scope="col">4s</th><th scope="col">6s</th></tr></thead>
        <tbody>{batters.map(batter => <tr key={batter.name}>
          <th scope="row">{batter.name}<small>{batter.name === score.striker ? 'On strike' : 'Other end'}</small></th>
          <td>{batter.runs}</td><td>{batter.balls}</td><td>{batter.fours}</td><td>{batter.sixes}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {currentBowler ? <div className="scorecard-table">
      <table>
        <caption>{bowler ? 'Current bowler' : 'Last bowler'}</caption>
        <thead><tr><th scope="col">Bowler</th><th scope="col">O</th><th scope="col">R</th><th scope="col">W</th></tr></thead>
        <tbody><tr><th scope="row">{currentBowler}</th><td>{formatOvers(figures?.balls ?? 0)}</td>
          <td>{figures?.runs ?? 0}</td><td>{figures?.wickets ?? 0}</td></tr></tbody>
      </table>
    </div> : <p className="muted">Bowling figures appear when a bowler is selected.</p>}
  </section>
}

export default function MatchScorecard({ match, metadata }: { match: Match; metadata?: MatchPosterMetadata }) {
  const inningsScores = useMemo(() => ([0, 1] as const).map(innings => (
    match.games[innings].length ? replay(rulesFor(match, innings), match.games[innings]) : null
  )), [match])
  const final = Boolean(match.finishedAt || match.stoppedAt)
  const impact = useMemo(() => impactPoints(inningsScores), [inningsScores])
  const leaderTitle = match.finishedAt ? 'Player of the Match' : match.stoppedAt ? 'Impact leader at stoppage' : 'Current match leader'
  const impactLeader = impact?.match.players[0]
    ? leaderTitle + ' · ' + impact.match.leaders.join(', ') + ' (' + formatPoints(impact.match.players[0].total) + ')'
    : ''
  const impactRate = impact
    ? (!final ? 'Provisional · ' : '') + impact.runsPerBall.toFixed(2) + ' runs per legal ball · ' + impact.wicketValue.toFixed(2) + ' points per wicket'
    : ''
  const impactNotes = impact?.innings.flatMap((item, index) => item?.leaders.length
    ? ['Innings ' + (index + 1) + ' Impact ' + (item.leaders.length === 1 ? 'Player' : 'Players') + ' · '
      + item.leaders.join(', ') + ' (' + formatPoints(item.players[0].total) + ')'] : []) ?? []
  const impactRows = impact?.match.players.map(item =>
    [item.name, ...[item.batting, item.bowling, item.fielding, item.total].map(formatPoints)]) ?? []

  return <><section aria-label="Match scorecard">
    <details open={final}>
      <summary className="scorecard-title">{final ? 'Final scorecard' : 'Full scorecard'}</summary>
      {match.toss && <p className="muted">{tossSummary(match)}</p>}
      {([0, 1] as const).map(innings => {
        const score = inningsScores[innings]
        const side = battingSide(match, innings)
        const battingTeam = teamLabel(match, side)
        const bowlingTeam = teamLabel(match, oppositeSide(side))
        const title = (innings === 0 ? 'First innings' : 'Second innings') + ' · ' + battingTeam
        const total = score && score.runs + '/' + score.wickets + ' in ' + score.overs + ' overs · ' + score.extras + ' extras'
        return <div className="scorecard-innings" key={innings}>
          <div className="score-share-heading">
            <h3>{title}</h3>
            {score && <CopyScoreImage label={'Copy ' + (innings === 0 ? 'first' : 'second') + ' innings as image'}
              filename={'turf-cricket-innings-' + (innings + 1)} match={match} metadata={metadata} selection={innings} />}
          </div>
          {!score ? <p className="muted">{innings > match.innings ? 'Innings not played.' : 'No deliveries recorded.'}</p> : <>
            <p>{total}</p>
            <div className="scorecard-table" tabIndex={0} role="region" aria-label={battingTeam + ' batting figures'}>
              <table>
                <caption>{battingTeam} batting</caption>
                <thead><tr>{battingColumns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
                <tbody>{score.batting.map(batter => <tr key={batter.name}>
                  <th scope="row">{batter.name}<small>{battingStatus(batter)}</small></th>
                  {battingCells(batter).map((cell, index) => <td key={index}>{cell}</td>)}
                </tr>)}</tbody>
              </table>
            </div>
            <div className="scorecard-table" tabIndex={0} role="region" aria-label={bowlingTeam + ' bowling figures'}>
              <table>
                <caption>{bowlingTeam} bowling</caption>
                <thead><tr>{bowlingColumns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
                <tbody>{score.bowling.map(bowler => <tr key={bowler.name}>
                  <th scope="row">{bowler.name}</th>
                  {bowlingCells(bowler).map((cell, index) => <td key={index}>{cell}</td>)}
                </tr>)}</tbody>
              </table>
            </div>
          </>}
        </div>
      })}
    </details>
  </section>
  <section aria-label="Impact Points">
    <div className="score-share-heading">
      <h2>Impact Points</h2>
      {impactLeader && <CopyScoreImage label="Copy Impact Points as image" filename="turf-cricket-impact"
        match={match} metadata={metadata} selection="impact" />}
    </div>
    {!impact ? <p className="muted">Impact Points appear after the first legal ball.</p> : <>
      {impactLeader && <p className="settings-success"><strong>{impactLeader}</strong></p>}
      <p className="muted">{impactRate}</p>
      {impactNotes.map(note => <p key={note}>{note}</p>)}
      <div className="scorecard-table" tabIndex={0} role="region" aria-label="Player impact rankings">
        <table>
          <caption>Match impact by player</caption>
          <thead><tr>{impactColumns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
          <tbody>{impactRows.map(([name, ...points]) => <tr key={name}>
            <th scope="row">{name}</th>{points.map((cell, index) => <td key={index}>{index === 3 ? <strong>{cell}</strong> : cell}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      {impact.unspecifiedWickets > 0 && <p className="muted">For wickets without a recorded dismissal type, bowling credit uses the original record. Fielding points include recorded fielding only.</p>}
    </>}
  </section></>
}
