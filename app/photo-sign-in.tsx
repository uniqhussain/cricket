'use client'

import { useState } from 'react'
import PasswordInput from './password-input'

export default function PhotoSignIn({ signedIn, onSession }: {
  signedIn: boolean
  onSession: (signedIn: boolean) => Promise<void>
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (signedIn) return <button disabled={busy} onClick={async () => {
    setBusy(true)
    try {
      const response = await fetch('/api/photo-session', { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not sign out.')
      await onSession(false)
    } catch { setError('Could not sign out.') }
    finally { setBusy(false) }
  }}>Sign out{error && <span role="alert"> · {error}</span>}</button>
  return <details open><summary>Sign in</summary>
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
        await onSession(true)
      } catch (err) { setError(err instanceof Error ? err.message : 'Could not sign in.') }
      finally { setBusy(false) }
    }}>
      <label>User ID, email, or phone with country code<input name="identifier" required autoComplete="username" /></label>
      <PasswordInput label="Password" name="password" required autoComplete="current-password" />
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </details>
}
