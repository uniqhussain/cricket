'use client'

import { useState } from 'react'
import type { Ground } from './match'

export default function GroundSettings({ grounds, addGround }: {
  grounds: Ground[]
  addGround: (name: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <section>
    <h2>Grounds</h2>
    {error && <p className="error" role="alert">{error}</p>}
    <form onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      setBusy(true)
      setError('')
      try { await addGround(name.trim()); setName('') }
      catch (error) { setError(error instanceof Error ? error.message : 'Could not save the ground.') }
      finally { setBusy(false) }
    }}>
      <label>Ground name<input value={name} onChange={event => setName(event.target.value)} required maxLength={120} disabled={busy} /></label>
      <button disabled={busy || !name.trim()}>{busy ? 'Saving ground…' : 'Add ground'}</button>
    </form>
    {grounds.length ? <ul>{grounds.map(ground => <li key={ground.id}>{ground.name}</li>)}</ul> : <p>Add a ground to select when starting a match.</p>}
  </section>
}
