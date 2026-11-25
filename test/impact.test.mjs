import test from 'node:test'
import assert from 'node:assert/strict'
import { impactPoints, formatPoints } from '../app/impact.ts'
import { replay } from '../app/scoring.ts'

test('the guide’s example ranks A1 first with +14.3 across the match', () => {
  const batting = rows => rows.map(([name, runs, balls]) => ({ name, batted: true, runs, balls }))
  const bowling = rows => rows.map(([name, balls, runs, wickets = 0]) => ({ name, balls, runs, wickets }))
  const result = impactPoints([
    { runs: 40, legal: 30, batting: batting([['A1', 25, 16], ['A2', 15, 14]]),
      bowling: bowling([['B1', 12, 12], ['B2', 6, 8], ['B3', 6, 9], ['B4', 6, 11]]), fielding: [] },
    { runs: 30, legal: 30, batting: batting([['B1', 12, 10], ['B2', 4, 7], ['B3', 3, 6], ['B4', 11, 7]]),
      bowling: bowling([['A3', 12, 9, 1], ['A1', 6, 6, 1], ['A4', 6, 8, 1], ['A2', 6, 7]]),
      fielding: [{ name: 'A2', catches: 1, stumpings: 0, runOuts: 0 }] },
  ])
  assert.equal(result.wicketValue, 7)
  assert.deepEqual(result.innings.map(item => item.leaders), [['A1'], ['A3']])
  assert.deepEqual(result.match.leaders, ['A1'])
  assert.equal(formatPoints(result.match.players[0].total), '+14.3')
  assert.equal(formatPoints(result.match.players.find(item => item.name === 'B2').total), '−5.2')
})

test('run-outs only award fielding credit and legacy wickets retain bowling credit', () => {
  const rules = { overs: 2, batters: ['A', 'B', 'C', 'D', 'E'], bowlers: ['F', 'G', 'H'], lastMan: true }
  const ball = { kind: 'legal', bowler: 'F', batRuns: 1, physicalRuns: 0 }
  const result = replay(rules, [
    { ...ball, dismissed: 'A', dismissal: { kind: 'caught', fielder: 'G' } },
    { ...ball, dismissed: 'C', dismissal: { kind: 'stumped', fielder: 'G' } },
    { ...ball, dismissed: 'B', dismissal: { kind: 'run-out', fielder: 'H' } },
    { ...ball, dismissed: 'D' },
  ])
  assert.equal(result.wickets, 4)
  assert.equal(result.bowling[0].wickets, 3)
  const impact = impactPoints([result])
  assert.equal(impact.unspecifiedWickets, 1)
  const points = name => impact.match.players.find(item => item.name === name)
  assert.equal(points('F').bowling, 18)
  assert.equal(points('G').fielding, 4)
  assert.equal(points('H').fielding, 6)
  assert.throws(() => replay(rules, [{ ...ball, dismissed: 'A', dismissal: { kind: 'caught', fielder: 'B' } }]), /bowling team/)
})
