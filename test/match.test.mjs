import test from 'node:test'
import assert from 'node:assert/strict'
import { applyOperation, canUmpire, frozenOvers, rulesFor } from '../app/match.ts'
import { loginIdentifier } from '../app/player-login.ts'
import { replay } from '../app/scoring.ts'

const match = {
  overs: 2, sides: [['A', 'B'], ['C', 'D']], games: [[], []],
  innings: 0, lastMan: true, designations: ['C', 'A'],
}
const dot = { kind: 'legal', batRuns: 0, physicalRuns: 0, bowler: 'C' }
const wide = { ...dot, kind: 'wide' }
const play = (state, balls) => balls.reduce((result, ball) => applyOperation(result, { operation: 'ball', ball }, false), state)

test('only admins and designated umpires can score shared matches', () => {
  assert.equal(canUmpire('admin'), true)
  assert.equal(canUmpire('umpire'), true)
  assert.equal(canUmpire('player'), false)
  assert.equal(canUmpire(), false)
})

test('the sixth legal ball freezes the over, including preceding extras', () => {
  const open = play(match, [dot, dot, wide, dot, dot, dot])
  assert.equal(frozenOvers(open, 0).length, 0)
  assert.equal(applyOperation(open, { operation: 'undo' }, false).games[0].length, 5)
  const closed = play(open, [dot])
  assert.deepEqual(frozenOvers(closed, 0).map(over => [over.over_number, over.end, over.score.runs]), [[1, 7, 1]])
  assert.throws(() => applyOperation(closed, { operation: 'undo' }, false), /frozen/)
  const next = play(closed, [{ ...dot, bowler: 'D' }])
  assert.deepEqual(applyOperation(next, { operation: 'undo' }, false).games, closed.games)
})

test('only an admin can correct a frozen delivery without changing the legal-ball count', () => {
  const closed = play(match, Array(6).fill(dot))
  const correction = { operation: 'correct', innings: 0, index: 0, ball: { ...dot, batRuns: 4, boundary: 4 } }
  assert.throws(() => applyOperation(closed, correction, false), /admin/)
  assert.throws(() => applyOperation(closed, { ...correction, ball: wide }, true), /legal-ball count/)
  const updated = applyOperation(closed, correction, true)
  assert.equal(replay(rulesFor(updated, 0), updated.games[0]).runs, 4)
  assert.equal(frozenOvers(updated, 0)[0].score.runs, 4)
})

test('a player user ID maps consistently while email and phone logins still work', () => {
  assert.deepEqual(loginIdentifier(' Player.01 '), { email: 'player.01@players.cricket.invalid' })
  assert.deepEqual(loginIdentifier('P@example.org'), { email: 'p@example.org' })
  assert.deepEqual(loginIdentifier('+919999999999'), { phone: '+919999999999' })
  assert.deepEqual(loginIdentifier('9999999999'), { email: '9999999999@players.cricket.invalid' })
})
