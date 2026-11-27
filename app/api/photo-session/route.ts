import { authConfig, photoUser, saveSession, signOut } from './auth'
import { loginIdentifier } from '../../player-login'

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return new Response('Forbidden', { status: 403 })
  const config = authConfig()
  if (!config) return Response.json({ error: 'Supabase authentication is not configured.' }, { status: 503 })
  try {
    const { email, identifier, password, rememberSession } = await request.json()
    const login = identifier ?? email
    if (typeof login !== 'string' || !login.trim() || typeof password !== 'string' || login.length > 254 || password.length > 1024) {
      return Response.json({ error: 'Enter your email or phone and password.' }, { status: 400 })
    }
    const response = await fetch(config.base + '/token?grant_type=password', {
      method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...loginIdentifier(login), password }), cache: 'no-store',
    })
    const data = await response.json()
    if (response.status === 429 || response.status >= 500) throw new Error('Authentication unavailable.')
    if (!response.ok || !data.access_token || !data.refresh_token)
      return Response.json({ error: 'Sign-in failed. Check your account details.' }, { status: 401 })
    await saveSession(data, rememberSession === true)
    return Response.json({ signedIn: true })
  } catch { return Response.json({ error: 'Sign-in is unavailable. Please retry.' }, { status: 502 }) }
}

export async function GET() {
  try { return Response.json({ signedIn: Boolean(await photoUser()) }) }
  catch { return Response.json({ error: 'Could not check your sign-in. Try again.' }, { status: 503 }) }
}

export async function DELETE(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return new Response('Forbidden', { status: 403 })
  try { await signOut() }
  catch { return Response.json({ signedIn: false, error: 'Signed out of this device. The server session could not be ended.' }, { status: 502 }) }
  return Response.json({ signedIn: false })
}
