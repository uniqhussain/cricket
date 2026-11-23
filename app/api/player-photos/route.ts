import { get, put } from '@vercel/blob'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { photoUser } from '../photo-session/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function signature(id: string, token: string) {
  return createHmac('sha256', token).update('player-photo:' + id).digest('hex')
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'Upload from the cricket app.' }, { status: 403 })
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return Response.json({ error: 'Connect the private Blob store to this project first.' }, { status: 503 })
  if (Number(request.headers.get('content-length') ?? 0) > 300000) {
    return Response.json({ error: 'Photo is too large.' }, { status: 413 })
  }
  try {
    if (!await photoUser()) return Response.json({ error: 'Sign in before uploading a photo.' }, { status: 401 })
    const data = await request.formData()
    const photo = data.get('photo')
    if (!(photo instanceof File) || photo.type !== 'image/jpeg' || photo.size > 250000 || photo.size < 3) {
      return Response.json({ error: 'Choose a valid compressed JPEG photo.' }, { status: 400 })
    }
    const bytes = new Uint8Array(await photo.arrayBuffer())
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) {
      return Response.json({ error: 'Invalid JPEG photo.' }, { status: 400 })
    }
    const id = randomUUID()
    await put('players/' + id + '.jpg', photo, {
      access: 'private', token, contentType: 'image/jpeg', addRandomSuffix: false,
    })
    return Response.json({ photo: '/api/player-photos?id=' + id + '&signature=' + signature(id, token) })
  } catch {
    return Response.json({ error: 'Could not upload the photo. Please retry.' }, { status: 502 })
  }
}

export async function GET(request: Request) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return new Response('Photo storage is unavailable.', { status: 503 })
  const params = new URL(request.url).searchParams
  const id = params.get('id') ?? ''
  const supplied = params.get('signature') ?? ''
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}$/.test(supplied)
    || !timingSafeEqual(Buffer.from(supplied), Buffer.from(signature(id, token)))) {
    return new Response('Photo not found.', { status: 404 })
  }
  try {
    const result = await get('players/' + id + '.jpg', { access: 'private', token })
    if (result?.statusCode !== 200) return new Response('Photo not found.', { status: 404 })
    return new Response(result.stream, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch {
    return new Response('Photo storage is unavailable.', { status: 502 })
  }
}
