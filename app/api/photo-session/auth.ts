import { cookies } from 'next/headers'

const accessCookie = 'cricket-photo-session'
const refreshCookie = 'cricket-refresh-session'
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' } as const
const refreshLifetime = 365 * 24 * 60 * 60

type AuthTokens = { access_token: string; refresh_token: string; expires_in?: number; user?: { id?: string } }

export function authConfig() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY
  return url && key ? { base: url + '/auth/v1', key } : null
}

export async function saveSession(tokens: AuthTokens, remember = true) {
  const jar = await cookies()
  jar.set(accessCookie, tokens.access_token, { ...cookieOptions, maxAge: Math.min(tokens.expires_in ?? 3600, 3600) })
  jar.set(refreshCookie, remember ? tokens.refresh_token : '', { ...cookieOptions, maxAge: remember ? refreshLifetime : 0 })
}

async function clearSession() {
  const jar = await cookies()
  for (const name of [accessCookie, refreshCookie]) jar.set(name, '', { ...cookieOptions, maxAge: 0 })
}

async function resolveSession(persistRefresh: boolean) {
  const jar = await cookies()
  const access = jar.get(accessCookie)?.value
  const refresh = jar.get(refreshCookie)?.value
  if (!access && !refresh) return null
  const config = authConfig()
  if (!config) throw new Error('Authentication is unavailable.')
  const { base, key } = config
  if (access) {
    const response = await fetch(base + '/user', {
      headers: { apikey: key, Authorization: 'Bearer ' + access }, cache: 'no-store',
    })
    if (response.ok) {
      const user = await response.json()
      if (typeof user.id !== 'string') throw new Error('Could not verify the signed-in account.')
      return { id: user.id as string, access }
    }
    if (response.status !== 401 && response.status !== 403) throw new Error('Could not verify the session.')
  }
  if (!refresh) return null
  const response = await fetch(base + '/token?grant_type=refresh_token', {
    method: 'POST', cache: 'no-store', headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  })
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return null
  }
  if (!response.ok) throw new Error('Could not renew the session.')
  const tokens: AuthTokens = await response.json()
  if (!tokens.access_token || !tokens.refresh_token || !tokens.user?.id)
    throw new Error('Could not renew the session.')
  if (persistRefresh) await saveSession(tokens)
  return { id: tokens.user.id, access: tokens.access_token }
}

export async function signedInUser() {
  const session = await resolveSession(true)
  return session ? { id: session.id } : null
}

export async function photoUser() {
  return (await signedInUser())?.id ?? null
}

export async function signOut() {
  try {
    const session = await resolveSession(false)
    const config = authConfig()
    if (session && config) {
      const response = await fetch(config.base + '/logout?scope=local', {
        method: 'POST', cache: 'no-store', headers: { apikey: config.key, Authorization: 'Bearer ' + session.access },
      })
      if (!response.ok && response.status !== 401 && response.status !== 403) throw new Error('Could not end the session.')
    }
  } finally {
    await clearSession()
  }
}

