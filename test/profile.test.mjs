import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePlayerDetails } from '../app/profile.ts'
import { ownsPhotoLink, photoSignature, readPhotoLink } from '../app/api/player-photos/photo-link.ts'

test('player details accept optional cricket fields and reject invalid values', () => {
  const details = validatePlayerDetails({ role: 'Bowler', bowling: 'Right-arm fast', jersey: '07', isCaptain: false })
  assert.equal(details.role, 'Bowler')
  assert.equal(details.jersey, '07')
  assert.equal(details.isCaptain, false)
  assert.throws(() => validatePlayerDetails({ role: 'Admin' }), /valid role/)
  assert.throws(() => validatePlayerDetails({ jersey: '1234' }), /jersey number/)
})

test('a signed profile photo can only be attached by the uploading user', () => {
  const id = '11111111-1111-1111-1111-111111111111'
  const owner = '22222222-2222-2222-2222-222222222222'
  const other = '33333333-3333-3333-3333-333333333333'
  const token = 'test-key'
  const signed = new URLSearchParams({ id, owner, signature: photoSignature(id, token, owner) })
  assert.equal(ownsPhotoLink('/api/player-photos?' + signed, owner, token), true)
  assert.equal(ownsPhotoLink('/api/player-photos?' + signed, other, token), false)
  signed.set('owner', other)
  assert.equal(readPhotoLink(signed, token), null)
  const legacy = new URLSearchParams({ id, signature: photoSignature(id, token) })
  assert.deepEqual(readPhotoLink(legacy, token), { id, owner: undefined })
  assert.equal(ownsPhotoLink('/api/player-photos?' + legacy, owner, token), false)
})
