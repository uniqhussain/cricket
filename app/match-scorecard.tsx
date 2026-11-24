import { useMemo } from 'react'
import { rulesFor, teamLabel, type Match } from './match'
import { formatOvers, replay } from './scoring'

export default function MatchScorecard({ match }: { match: Match }) {
  const inningsScores = useMemo(() => ([0, 1] as const).map(innings => (
    match.games[innings].length ? replay(rulesFor(match, innings), match.games[innings]) : null
  )), [match])
  const final = Boolean(match.finishedAt || match.stoppedAt)

  return <section aria-label="Match scorecard">
    <details open={final}>
      <summary className="scorecard-title">{final ? 'Final scorecard' : 'Scorecard'}</summary>
      {([0, 1] as const).map(innings => {
        const score = inningsScores[innings]
        const battingTeam = teamLabel(match, innings)
        const bowlingTeam = teamLabel(match, innings === 0 ? 1 : 0)
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
                  <th scope="row">{batter.name}<small>{batter.dismissedBy
                    ? 'Out · ' + batter.dismissedBy : batter.batted ? 'Not out' : 'Did not bat'}</small></th>
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
}
