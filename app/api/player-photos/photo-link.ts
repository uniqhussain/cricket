import { createHmac, timingSafeEqual } from 'node:crypto'

export function photoSignature(id: string, token: string, owner?: string) {
  return createHmac('sha256', token).update('player-photo:' + id + (owner ? ':' + owner : '')).digest('hex')
}

export function readPhotoLink(params: URLSearchParams, token: string) {
  const id = params.get('id') ?? ''
  const owner = params.get('owner') ?? undefined
  const signature = params.get('signature') ?? ''
  if (!/^[a-f0-9-]{36}$/.test(id) || (owner !== undefined && !/^[a-f0-9-]{36}$/.test(owner))
    || !/^[a-f0-9]{64}$/.test(signature)
    || !timingSafeEqual(Buffer.from(signature), Buffer.from(photoSignature(id, token, owner)))) return null
  return { id, owner }
}

export function ownsPhotoLink(link: string, userId: string, token?: string) {
  const prefix = '/api/player-photos?'
  return Boolean(token && link.startsWith(prefix)
    && readPhotoLink(new URLSearchParams(link.slice(prefix.length)), token)?.owner === userId)
}
