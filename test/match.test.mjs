import test from 'node:test'
import assert from 'node:assert/strict'
import { applyOperation, awaitingToss, battingSide, canUmpire, elapsedMatchSeconds, frozenOvers, matchWinner, overCards, rulesFor, teamLabel, updateMatchFinish } from '../app/match.ts'
import { seriesResult } from '../app/series.ts'
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
const choose = (state, striker, partner) => applyOperation(state, { operation: 'batters', pair: { striker, partner } }, false)
const opened = choose(match, 'A', 'B')

test('1G counts as a legal batting run without rotating strike within an over', () => {
  const ground = { ...dot, batRuns: 1, groundRun: true }
  const state = play(opened, [ground])
  const score = replay(rulesFor(state, 0), state.games[0])
  assert.deepEqual([score.runs, score.extras, score.legal, score.striker], [1, 0, 1, 'A'])
  assert.deepEqual([score.batting[0].runs, score.batting[0].balls, score.bowling[0].runs], [1, 1, 1])
  assert.equal(state.games[0][0].groundRun, true)
  const normal = play(state, [{ ...dot, batRuns: 1, physicalRuns: 1 }])
  assert.equal(replay(rulesFor(normal, 0), normal.games[0]).striker, 'B')
  assert.throws(() => play(opened, [{ ...ground, physicalRuns: 1 }]), /1G must be/)
})

test('a sixth-ball 1G preserves the normal over-end change and can be corrected by an admin', () => {
  const ground = { ...dot, batRuns: 1, groundRun: true }
  const completeOver = play(opened, [...Array(5).fill(dot), ground])
  assert.equal(replay(rulesFor(completeOver, 0), completeOver.games[0]).striker, 'B')
  assert.equal(frozenOvers(completeOver, 0)[0].score.deliveries[5].groundRun, true)
  const corrected = applyOperation(completeOver, { operation: 'correct', innings: 0, index: 5, ball: dot }, true)
  assert.equal(replay(rulesFor(corrected, 0), corrected.games[0]).runs, 0)
})

test('series batting order starts the match without recording a new toss', () => {
  const next = { ...match, toss: undefined, batFirst: 1 }
  assert.equal(awaitingToss(next), false)
  assert.equal(battingSide(next, 0), 1)
  assert.equal(battingSide(next, 1), 0)
  assert.deepEqual(rulesFor(next, 0).batters, ['C', 'D'])
  assert.throws(() => applyOperation(next, { operation: 'toss', toss: match.toss }, true), /cannot be changed/)
})

test('retired hurt consumes no ball or wicket and the batter can return at a wicket', () => {
  const start = choose({ ...match, sides: [['A', 'B', 'E'], ['C', 'D']] }, 'A', 'B')
  const first = play(start, [{ ...dot, batRuns: 4, boundary: 4 }])
  const retired = applyOperation(first, { operation: 'retire', batter: 'A', replacement: 'E' }, false)
  const after = replay(rulesFor(retired, 0), retired.games[0])
  assert.deepEqual([after.runs, after.legal, after.wickets, after.striker], [4, 1, 0, 'E'])
  assert.equal(after.batting.find(batter => batter.name === 'A').retiredHurt, true)
  const undone = applyOperation(retired, { operation: 'undo' }, false)
  assert.deepEqual(replay(rulesFor(undone, 0), undone.games[0]), replay(rulesFor(first, 0), first.games[0]))
  const wicket = play(retired, [{ ...dot, dismissed: 'E', dismissal: { kind: 'bowled' } }])
  assert.deepEqual(replay(rulesFor(wicket, 0), wicket.games[0]).pendingPair.candidates, ['B', 'A'])
  const returned = choose(wicket, 'A', 'B')
  const score = replay(rulesFor(returned, 0), returned.games[0])
  assert.equal(score.striker, 'A')
  assert.equal(score.batting.find(batter => batter.name === 'A').retiredHurt, undefined)
  assert.equal(score.batting.find(batter => batter.name === 'A').runs, 4)
  assert.equal(score.batting.find(batter => batter.name === 'E').dismissal.kind, 'bowled')
  assert.equal(score.bowling[0].wickets, 1)
})

test('retiring with no replacement follows the last-batter rule and leaves frozen overs intact', () => {
  const over = play(opened, Array(6).fill(dot))
  const operation = { operation: 'retire', batter: 'A' }
  const retired = applyOperation(over, operation, false)
  const score = replay(rulesFor(retired, 0), retired.games[0])
  assert.deepEqual([score.striker, score.partner, score.complete, score.wickets], ['B', undefined, false, 0])
  assert.deepEqual(frozenOvers(retired, 0), frozenOvers(over, 0))
  assert.deepEqual(frozenOvers(applyOperation(retired, { operation: 'undo' }, false), 0), frozenOvers(over, 0))
  const ends = applyOperation({ ...over, lastMan: false }, operation, false)
  assert.equal(replay(rulesFor(ends, 0), ends.games[0]).complete, true)
  const lastBatter = play(retired, [{ ...dot, bowler: 'D', dismissed: 'B', dismissal: { kind: 'bowled' } }])
  const afterWicket = replay(rulesFor(lastBatter, 0), lastBatter.games[0])
  assert.equal(afterWicket.complete, true)
  assert.equal(afterWicket.batting.find(batter => batter.name === 'A').retiredHurt, true)
})

test('over cards include extras, preserve delivery order, and show an incomplete over', () => {
  const four = { ...dot, batRuns: 4, boundary: 4 }
  const state = play(opened, [four, wide, dot, dot, dot, dot, dot, { ...wide, bowler: 'D' }])
  const [first, second] = overCards(state, 0)
  assert.deepEqual([first.over_number, first.locked, first.legalBalls, first.score.runs, first.inningsRuns], [1, true, 6, 5, 5])
  assert.deepEqual(first.score.deliveries.map(ball => ball.kind), ['legal', 'wide', 'legal', 'legal', 'legal', 'legal', 'legal'])
  assert.deepEqual([second.over_number, second.locked, second.legalBalls, second.score.runs, second.inningsRuns], [2, false, 0, 1, 6])
  assert.equal(frozenOvers(state, 0).length, 1)
  assert.equal(frozenOvers(state, 0)[0].end, 7)
})

test('series tally uses team identities even when Team B bats first', () => {
  const teamBFirst = { ...match, overs: 1, toss: { winner: 1, decision: 'bat' } }
  const first = play(choose(teamBFirst, 'C', 'D'), Array(6).fill({ ...dot, bowler: 'A' }))
  const chase = choose(applyOperation(first, { operation: 'chase' }, true), 'A', 'B')
  const won = play(chase, [{ ...dot, batRuns: 1, physicalRuns: 1 }])
  assert.equal(matchWinner(won), 0)
  assert.equal(matchWinner(chase), null)
  assert.equal(matchWinner(play(chase, Array(6).fill(dot))), null)
  const stopping = applyOperation({ ...match, toss: undefined }, { operation: 'stop' }, true)
  assert.ok(stopping.stoppedAt)
  assert.equal(matchWinner(stopping), null)
})

test('ended series report a win, tie, or no result', () => {
  const series = { team_a: 'West', team_b: 'East', wins_a: 0, wins_b: 0, ties: 0, ended_at: 'ended' }
  assert.equal(seriesResult({ ...series, wins_b: 2, wins_a: 1 }), 'East wins the series 2–1')
  assert.equal(seriesResult({ ...series, ties: 1 }), 'Series tied')
  assert.equal(seriesResult(series), 'No winner · No completed matches')
  assert.equal(seriesResult({ ...series, ended_at: null }), null)
})

test('choose openers and a replacement pair, then replay the correct batting figures', () => {
  const lineup = { ...match, sides: [['A', 'B', 'F', 'G'], ['C', 'D']] }
  const score = state => replay(rulesFor(state, 0), state.games[0])
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

test('two-player teams choose who opens and the last batter can continue alone', () => {
  assert.deepEqual(replay(rulesFor(match, 0), []).pendingPair?.candidates, ['A', 'B'])
  assert.throws(() => play(match, [dot]), /Choose both batters/)
  const wicket = play(choose(match, 'B', 'A'), [{ ...dot, dismissed: 'B' }])
  const score = replay(rulesFor(wicket, 0), wicket.games[0])
  assert.equal(score.pendingPair, undefined)
  assert.equal(score.striker, 'A')
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
  const firstInnings = play({ ...opened, overs: 1, startedAt: 1000 }, Array(6).fill(dot))
  assert.equal(firstInnings.finishedAt, undefined)
  const chase = choose(applyOperation(firstInnings, { operation: 'chase' }, true), 'C', 'D')
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
  const open = play(opened, [dot, dot, wide, dot, dot, dot])
  assert.equal(frozenOvers(open, 0).length, 0)
  assert.equal(applyOperation(open, { operation: 'undo' }, false).games[0].length, 5)
  const closed = play(open, [dot])
  assert.deepEqual(frozenOvers(closed, 0).map(over => [over.over_number, over.end, over.score.runs]), [[1, 7, 1]])
  assert.throws(() => applyOperation(closed, { operation: 'undo' }, false), /frozen/)
  const next = play(closed, [{ ...dot, bowler: 'D' }])
  assert.deepEqual(applyOperation(next, { operation: 'undo' }, false).games, closed.games)
})

test('only an admin can correct a frozen delivery without changing the legal-ball count', () => {
  const closed = play(opened, Array(6).fill(dot))
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
