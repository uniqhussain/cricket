import { cookies } from 'next/headers'

import { photoUser } from './auth'

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return new Response('Forbidden', { status: 403 })
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY
  if (!url || !key) return Response.json({ error: 'Supabase authentication is not configured.' }, { status: 503 })
  try {
    const { email, password } = await request.json()
    if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > 1024) {
      return Response.json({ error: 'Enter your email and password.' }, { status: 400 })
    }
    const response = await fetch(url + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }), cache: 'no-store',
    })
    const data = await response.json()
    if (!response.ok || !data.access_token) return Response.json({ error: 'Sign-in failed. Check your account details.' }, { status: 401 })
    const cookieStore = await cookies()
    cookieStore.set('cricket-photo-session', data.access_token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
      path: '/', maxAge: Math.min(data.expires_in ?? 3600, 3600),
    })
    return Response.json({ signedIn: true })
  } catch { return Response.json({ error: 'Sign-in is unavailable. Please retry.' }, { status: 502 }) }
}

export async function GET() {
  try { return Response.json({ signedIn: Boolean(await photoUser()) }) }
  catch { return Response.json({ signedIn: false }) }
}
