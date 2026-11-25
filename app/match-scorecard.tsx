import { useMemo } from 'react'
import { battingSide, oppositeSide, rulesFor, teamLabel, tossSummary, type Match } from './match'
import { formatOvers, replay } from './scoring'
import { formatPoints, impactPoints } from './impact'

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

export default function MatchScorecard({ match }: { match: Match }) {
  const inningsScores = useMemo(() => ([0, 1] as const).map(innings => (
    match.games[innings].length ? replay(rulesFor(match, innings), match.games[innings]) : null
  )), [match])
  const final = Boolean(match.finishedAt || match.stoppedAt)
  const impact = useMemo(() => impactPoints(inningsScores), [inningsScores])

  return <><section aria-label="Match scorecard">
    <details open={final}>
      <summary className="scorecard-title">{final ? 'Final scorecard' : 'Full scorecard'}</summary>
      {match.toss && <p className="muted">{tossSummary(match)}</p>}
      {([0, 1] as const).map(innings => {
        const score = inningsScores[innings]
        const side = battingSide(match, innings)
        const battingTeam = teamLabel(match, side)
        const bowlingTeam = teamLabel(match, oppositeSide(side))
        return <div className="scorecard-innings" key={innings}>
          <h3>{innings === 0 ? 'First innings' : 'Second innings'} · {battingTeam}</h3>
          {!score ? <p className="muted">{innings > match.innings ? 'Innings not played.' : 'No deliveries recorded.'}</p> : <>
            <p><strong>{score.runs}/{score.wickets}</strong> in {score.overs} overs · {score.extras} extras</p>
            <div className="scorecard-table" tabIndex={0} role="region" aria-label={battingTeam + ' batting figures'}>
              <table>
                <caption>{battingTeam} batting</caption>
                <thead><tr>
                  <th scope="col">Batter</th><th scope="col">R</th><th scope="col">B</th>
                  <th scope="col">4s</th><th scope="col">6s</th><th scope="col">SR</th>
                </tr></thead>
                <tbody>{score.batting.map(batter => <tr key={batter.name}>
                  <th scope="row">{batter.name}<small>{batter.dismissal?.kind === 'run-out' ? 'Run-out · ' + batter.dismissal.fielder
                    : batter.dismissedBy ? 'Out · ' + batter.dismissedBy : batter.batted ? 'Not out' : 'Did not bat'}</small></th>
                  <td>{batter.batted ? batter.runs : '—'}</td>
                  <td>{batter.batted ? batter.balls : '—'}</td>
                  <td>{batter.batted ? batter.fours : '—'}</td>
                  <td>{batter.batted ? batter.sixes : '—'}</td>
                  <td>{batter.balls ? (batter.runs * 100 / batter.balls).toFixed(1) : '—'}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <div className="scorecard-table" tabIndex={0} role="region" aria-label={bowlingTeam + ' bowling figures'}>
              <table>
                <caption>{bowlingTeam} bowling</caption>
                <thead><tr>
                  <th scope="col">Bowler</th><th scope="col">O</th><th scope="col">M</th><th scope="col">R</th>
                  <th scope="col">W</th><th scope="col">WD</th><th scope="col">NB</th><th scope="col">Econ</th>
                </tr></thead>
                <tbody>{score.bowling.map(bowler => <tr key={bowler.name}>
                  <th scope="row">{bowler.name}</th>
                  <td>{formatOvers(bowler.balls)}</td><td>{bowler.maidens}</td><td>{bowler.runs}</td>
                  <td>{bowler.wickets}</td><td>{bowler.wides}</td><td>{bowler.noBalls}</td>
                  <td>{bowler.balls ? (bowler.runs * 6 / bowler.balls).toFixed(1) : '—'}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </>}
        </div>
      })}
    </details>
  </section>
  <section aria-label="Impact Points">
    <h2>Impact Points</h2>
    {!impact ? <p className="muted">Impact Points appear after the first legal ball.</p> : <>
      {impact.match.leaders.length > 0 && <p className="settings-success"><strong>
        {match.finishedAt ? 'Player of the Match' : match.stoppedAt ? 'Impact leader at stoppage' : 'Current match leader'} · {impact.match.leaders.join(', ')}
        {' (' + formatPoints(impact.match.players[0].total) + ')'}
      </strong></p>}
      <p className="muted">{!final && 'Provisional · '}
        {impact.runsPerBall.toFixed(2)} runs per legal ball · {impact.wicketValue.toFixed(2)} points per wicket
      </p>
      {impact.innings.map((item, index) => item && item.leaders.length > 0 && <p key={index}>
        Innings {index + 1} Impact {item.leaders.length === 1 ? 'Player' : 'Players'} · <strong>{item.leaders.join(', ')}</strong>
        {' (' + formatPoints(item.players[0].total) + ')'}
      </p>)}
      <div className="scorecard-table" tabIndex={0} role="region" aria-label="Player impact rankings">
        <table>
          <caption>Match impact by player</caption>
          <thead><tr><th scope="col">Player</th><th scope="col">Bat</th><th scope="col">Bowl</th><th scope="col">Field</th><th scope="col">Total</th></tr></thead>
          <tbody>{impact.match.players.map(item => <tr key={item.name}>
            <th scope="row">{item.name}</th><td>{formatPoints(item.batting)}</td><td>{formatPoints(item.bowling)}</td>
            <td>{formatPoints(item.fielding)}</td><td><strong>{formatPoints(item.total)}</strong></td>
          </tr>)}</tbody>
        </table>
      </div>
      {impact.unspecifiedWickets > 0 && <p className="muted">For wickets without a recorded dismissal type, bowling credit uses the original record. Fielding points include recorded fielding only.</p>}
    </>}
  </section></>
}
