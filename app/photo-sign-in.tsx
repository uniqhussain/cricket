'use client'

import { useEffect, useState } from 'react'

export default function PhotoSignIn({ onSession, scoring = false }: { onSession?: () => void; scoring?: boolean }) {
  const [signedIn, setSignedIn] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    fetch('/api/photo-session').then(response => response.json()).then(data => setSignedIn(data.signedIn === true)).catch(() => {})
  }, [])
  if (signedIn) return scoring ? <button disabled={busy} onClick={async () => {
    setBusy(true)
    try {
      const response = await fetch('/api/photo-session', { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not sign out.')
      setSignedIn(false)
      onSession?.()
    } catch { setError('Could not sign out.') }
    finally { setBusy(false) }
  }}>Sign out{error && <span role="alert"> · {error}</span>}</button> : <p>Photo uploads enabled.</p>
  return <details open={scoring || undefined}><summary>{scoring ? 'Sign in to shared scoring' : 'Sign in to upload player photos'}</summary>
    <form onSubmit={async event => {
      event.preventDefault()
      const form = event.currentTarget
      const data = new FormData(form)
      setBusy(true)
      setError('')
      try {
        const response = await fetch('/api/photo-session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: data.get('identifier'), password: data.get('password') }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error)
        form.reset()
        setSignedIn(true)
        onSession?.()
      } catch (err) { setError(err instanceof Error ? err.message : 'Could not sign in.') }
      finally { setBusy(false) }
    }}>
      <label>User ID, email, or phone with country code<input name="identifier" required autoComplete="username" /></label>
      <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </details>
}
