import test from 'node:test'
import assert from 'node:assert/strict'
import { applyOperation, awaitingToss, battingSide, canUmpire, elapsedMatchSeconds, frozenOvers, rulesFor, teamLabel, updateMatchFinish } from '../app/match.ts'
import { loginIdentifier } from '../app/player-login.ts'
import { replay } from '../app/scoring.ts'

const match = {
  overs: 2, sides: [['A', 'B'], ['C', 'D']], games: [[], []],
  innings: 0, lastMan: true,
  toss: { winner: 0, decision: 'bat' },
}
const dot = { kind: 'legal', batRuns: 0, physicalRuns: 0, bowler: 'C' }
const wide = { ...dot, kind: 'wide' }
const play = (state, balls) => balls.reduce((result, ball) => applyOperation(result, { operation: 'ball', ball }, false), state)

test('choose openers and a replacement pair, then replay the correct batting figures', () => {
  const lineup = { ...match, sides: [['A', 'B', 'F', 'G'], ['C', 'D']] }
  const score = state => replay(rulesFor(state, 0), state.games[0])
  const choose = (state, striker, partner) => applyOperation(state, { operation: 'batters', pair: { striker, partner } }, false)
  assert.throws(() => play(lineup, [dot]), /Choose both batters/)
  const opened = choose(lineup, 'F', 'B')
  const wicket = play(opened, [{ ...dot, dismissed: 'F' }])
  assert.deepEqual(score(wicket).pendingPair, { survivor: 'B', candidates: ['B', 'A', 'G'] })
  assert.throws(() => choose(wicket, 'A', 'G'), /surviving batter/)
  assert.throws(() => choose(wicket, 'F', 'B'), /eligible batters/)
  const selected = choose(wicket, 'G', 'B')
  const scored = play(selected, [{ ...dot, batRuns: 1, physicalRuns: 1 }])
  assert.equal(score(scored).striker, 'B')
  assert.deepEqual(score(scored).batting.map(batter => [batter.name, batter.runs]), [['F', 0], ['B', 0], ['G', 1], ['A', 0]])
  const undone = applyOperation(selected, { operation: 'undo' }, false)
  assert.equal(score(undone).striker, 'F')
  assert.equal(undone.battingPairs[0][1], undefined)
})

test('two openers are automatic and the last batter can continue alone', () => {
  const wicket = play(match, [{ ...dot, dismissed: 'A' }])
  const score = replay(rulesFor(wicket, 0), wicket.games[0])
  assert.equal(score.pendingPair, undefined)
  assert.equal(score.striker, 'B')
  assert.equal(score.partner, undefined)
})

test('the toss is required before scoring and all four outcomes choose the batting order', () => {
  const pending = { ...match, toss: undefined }
  assert.equal(awaitingToss(pending), true)
  assert.throws(() => play(pending, [dot]), /Record the toss/)
  assert.throws(() => applyOperation(pending, { operation: 'toss', toss: { winner: 2, decision: 'bat' } }, true), /Choose the toss winner/)
  for (const winner of [0, 1]) {
    for (const decision of ['bat', 'bowl']) {
      const first = decision === 'bat' ? winner : 1 - winner
      const started = applyOperation(pending, { operation: 'toss', toss: { winner, decision } }, false)
      assert.ok(started.startedAt)
      assert.equal(battingSide(started, 0), first)
      assert.equal(battingSide(started, 1), 1 - first)
      assert.deepEqual(rulesFor(started, 0).batters, match.sides[first])
      assert.deepEqual(rulesFor(started, 0).bowlers, match.sides[1 - first])
      assert.throws(() => applyOperation(started, { operation: 'toss', toss: started.toss }, true), /cannot be changed/)
    }
  }
})

test('existing scored matches keep their batting order, and existing empty matches can record the toss', () => {
  const legacy = { ...match, toss: undefined, startedAt: 5000 }
  const started = applyOperation(legacy, { operation: 'toss', toss: { winner: 0, decision: 'bowl' } }, true)
  assert.equal(started.startedAt, 5000)
  const scored = { ...legacy, games: [[dot], []] }
  assert.equal(awaitingToss(scored), false)
  assert.equal(battingSide(scored, 0), 0)
  assert.throws(() => applyOperation(scored, { operation: 'toss', toss: started.toss }, true), /cannot be changed/)
})

test('the clock freezes when the chase ends and resumes if undo reopens it', () => {
  const firstInnings = play({ ...match, overs: 1, startedAt: 1000 }, Array(6).fill(dot))
  assert.equal(firstInnings.finishedAt, undefined)
  const chase = applyOperation(firstInnings, { operation: 'chase' }, true)
  const won = applyOperation(chase, { operation: 'ball', ball: { ...dot, bowler: 'A', batRuns: 1, physicalRuns: 1 } }, true)
  assert.ok(won.finishedAt)
  const finished = updateMatchFinish({ ...won, finishedAt: undefined }, 6500)
  assert.equal(elapsedMatchSeconds(finished, 20000), 5)
  assert.equal(updateMatchFinish(finished, 30000).finishedAt, 6500)
  const reopened = applyOperation(finished, { operation: 'undo' }, true)
  assert.equal(reopened.finishedAt, undefined)
  assert.equal(elapsedMatchSeconds(reopened, 20000), 19)
  assert.equal(elapsedMatchSeconds({ ...reopened, stoppedAt: 4500 }, 20000), 3)
})

test('a team nickname takes precedence over its full name', () => {
  const named = { ...match, teamNames: ['Westfield Cricket', 'Eastfield Cricket'], teamNicknames: ['West', ''] }
  assert.equal(teamLabel(named, 0), 'West')
  assert.equal(teamLabel(named, 1), 'Eastfield Cricket')
})

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
