'use client'

import { useEffect, useState } from 'react'

export default function PhotoSignIn() {
  const [signedIn, setSignedIn] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    fetch('/api/photo-session').then(response => response.json()).then(data => setSignedIn(data.signedIn === true)).catch(() => {})
  }, [])
  if (signedIn) return <p>Photo uploads enabled.</p>
  return <details><summary>Sign in to upload player photos</summary>
    <form onSubmit={async event => {
      event.preventDefault()
      const form = event.currentTarget
      const data = new FormData(form)
      setBusy(true)
      setError('')
      try {
        const response = await fetch('/api/photo-session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error)
        form.reset()
        setSignedIn(true)
      } catch (err) { setError(err instanceof Error ? err.message : 'Could not sign in.') }
      finally { setBusy(false) }
    }}>
      <label>Email<input name="email" type="email" required autoComplete="username" /></label>
      <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </details>
}
