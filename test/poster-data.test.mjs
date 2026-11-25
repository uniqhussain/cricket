import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPosterData } from '../app/poster-data.ts'

function delivery(bowler, batRuns = 0, detail = {}) {
  return { bowler, kind: 'legal', batRuns, physicalRuns: batRuns, ...detail }
}

const fixture = {
  teamNames: ['Emerald', 'Navy'],
  sides: [['Arun', 'Ben', 'Chin'], ['Dinesh', 'Emil', 'Fran']],
  ground: { id: 'ground', name: 'Turf Ground' },
  startedAt: Date.UTC(2026, 10, 25, 12),
  finishedAt: Date.UTC(2026, 10, 25, 13),
  lastMan: false,
  overs: 1,
  innings: 1,
  toss: { winner: 0, decision: 'bowl' },
  games: [
    [delivery('Arun', 0, { kind: 'wide', physicalRuns: 1 }), delivery('Arun', 0, { kind: 'no-ball' }),
      ...Array.from({ length: 6 }, () => delivery('Arun'))],
    [delivery('Dinesh', 0, { dismissed: 'Arun', dismissal: { kind: 'run-out', fielder: 'Emil' } }),
      delivery('Dinesh', 4, { boundary: 4, physicalRuns: 0 })],
  ],
}

test('poster verifies a chase with reversed batting order, extras and a run-out', () => {
  const poster = buildPosterData(fixture, { createdAt: '2026-11-25', series: { number: 2, matchNumber: 4, name: 'Night Series' } })
  assert.equal(poster.result, 'Emerald won by 1 wicket')
  assert.deepEqual(poster.metadata, ['Series 2 · Match 4 · Night Series', '25 Nov 2026 · Turf Ground'])
  assert.deepEqual(poster.sections[0].innings, { battingTeam: 'Navy', score: '2/0', overs: '1.0', extras: 2 })
  assert.deepEqual(poster.sections[0].tables[1].rows[0], ['Arun', '1.0', '0', '2', '0', '1', '1', '2.0'])
  assert.deepEqual(poster.sections[1].tables[1].rows[0], ['Dinesh', '0.2', '0', '4', '0', '0', '0', '12.0'])
  assert.deepEqual(poster.sections[1].tables[0].rows.find(row => row[0] === 'Chin'), ['Chin', '4', '1', '1', '0', '400.0'])
  assert.match(poster.text, /Player of the Match/)
  assert.match(poster.text, /25 Nov 2026/)
})

test('poster preserves ties and a defending win by runs', () => {
  const second = Array.from({ length: 6 }, (_, index) => delivery('Dinesh', index === 0 ? 2 : 0))
  assert.equal(buildPosterData({ ...fixture, games: [fixture.games[0], second] }).result, 'Match tied')
  const dots = second.map(ball => ({ ...ball, batRuns: 0, physicalRuns: 0 }))
  const defended = buildPosterData({ ...fixture, games: [fixture.games[0], dots] })
  assert.equal(defended.result, 'Navy won by 2 runs')
  assert.equal(defended.sections[1].tables[1].rows[0][2], '1')
  assert.ok(!defended.metadata.some(label => label.startsWith('Series')))
})

test('poster validates that an innings is complete without editing saved data', () => {
  const incomplete = { ...fixture, games: [fixture.games[0], fixture.games[1].slice(0, 1)] }
  const before = JSON.stringify(incomplete)
  assert.throws(() => buildPosterData(incomplete), /Innings 2 could not be verified/)
  assert.throws(() => buildPosterData({ ...fixture, stoppedAt: fixture.finishedAt }), /Finish both innings/)
  assert.equal(JSON.stringify(incomplete), before)
})
