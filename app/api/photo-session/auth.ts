import { cookies } from 'next/headers'

export async function photoUser() {
  const session = (await cookies()).get('cricket-photo-session')?.value
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY
  if (!session || !url || !key) return null
  const response = await fetch(url + '/auth/v1/user', {
    headers: { apikey: key, Authorization: 'Bearer ' + session }, cache: 'no-store',
  })
  if (!response.ok) return null
  const user = await response.json()
  return typeof user.id === 'string' ? user.id as string : null
}

