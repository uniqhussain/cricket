import test from 'node:test'
import assert from 'node:assert/strict'
import { replay } from '../app/scoring.ts'

const rules = { overs: 5, batters: ['A', 'B', 'C', 'D'], bowlers: ['E', 'F', 'G', 'H'], designated: 'E', lastMan: true }
const ball = (kind = 'legal', batRuns = 0, physicalRuns = batRuns, bowler = 'E') => ({ kind, batRuns, physicalRuns, bowler })

test('wides and no-balls score without advancing the over', () => {
  const score = replay(rules, [ball('wide', 0, 1), ball('no-ball', 2), ball()])
  assert.deepEqual([score.runs, score.extras, score.legal, score.striker], [4, 2, 1, 'B'])
})

test('three wickets leave one batter standing', () => {
  const deliveries = ['A', 'C', 'D'].map(dismissed => ({ ...ball(), dismissed }))
  const score = replay(rules, deliveries)
  assert.deepEqual([score.striker, score.partner, score.complete], ['B', undefined, false])
  assert.equal(replay(rules, [...deliveries, { ...ball(), dismissed: 'B' }]).complete, true)
})

test('enforces bowling quota and consecutive-over rule', () => {
  const over = bowler => Array.from({ length: 6 }, () => ball('legal', 0, 0, bowler))
  assert.throws(() => replay(rules, [...over('E'), ball()]), /different bowler/)
  const score = replay(rules, ['E', 'F', 'E', 'G', 'H'].flatMap(over))
  assert.deepEqual([score.quota.E, score.overs, score.complete], [12, '5.0', true])
})

test('a chase finishes as soon as the target is met', () => {
  const score = replay({ ...rules, target: 2 }, [ball('no-ball', 2)])
  assert.deepEqual([score.runs, score.legal, score.complete], [2, 0, true])
})

test('scorecard follows strike changes, extras, boundaries and wickets', () => {
  const score = replay(rules, [
    { ...ball('legal', 4, 0), boundary: 4 },
    ball('wide', 0, 1),
    { ...ball('no-ball', 6, 0), boundary: 6 },
    { ...ball('legal', 1), dismissed: 'A' },
    ball(),
  ])
  assert.deepEqual(score.batting.map(({ name, runs, balls, fours, sixes, dismissedBy }) =>
    [name, runs, balls, fours, sixes, dismissedBy]), [
    ['A', 4, 1, 1, 0, 'E'],
    ['B', 7, 1, 0, 1, undefined],
    ['C', 0, 1, 0, 0, undefined],
    ['D', 0, 0, 0, 0, undefined],
  ])
  assert.equal(score.batting[3].batted, false)
  assert.deepEqual(score.bowling, [{ name: 'E', balls: 3, maidens: 0, runs: 13, wickets: 1, wides: 1, noBalls: 1 }])
  assert.equal(score.batting.reduce((sum, player) => sum + player.runs, score.extras), score.runs)
})

test('maidens count only for completed overs with no runs', () => {
  const score = replay(rules, [
    ...Array.from({ length: 6 }, () => ball()),
    ball('wide', 0, 0, 'F'),
    ...Array.from({ length: 6 }, () => ball('legal', 0, 0, 'F')),
    ball(),
  ])
  assert.deepEqual(score.bowling.map(({ name, balls, maidens, runs }) => [name, balls, maidens, runs]), [
    ['E', 7, 1, 0], ['F', 6, 0, 1],
  ])
})
