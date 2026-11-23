'use client'

import { useEffect, useState } from 'react'

export type Ground = { id: string; name: string }
const key = 'turf-cricket-grounds-v1'

export function useGrounds() {
  const [grounds, setGrounds] = useState<Ground[]>([])
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
      if (!Array.isArray(saved) || !saved.every(ground => typeof ground?.id === 'string' && typeof ground?.name === 'string')) throw new Error()
      setGrounds(saved)
    } catch { setError('Could not open the saved grounds.') }
    setReady(true)
  }, [])

  function addGround(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    if (grounds.some(ground => ground.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('This ground is already saved.')
      return false
    }
    try {
      const updated = [...grounds, { id: crypto.randomUUID(), name: trimmed }]
      localStorage.setItem(key, JSON.stringify(updated))
      setGrounds(updated)
      setError('')
      return true
    } catch { setError('Could not save the ground. Please retry.') }
    return false
  }
  return { grounds, addGround, error, ready }
}

export default function GroundSettings({ grounds, addGround, error, ready }: ReturnType<typeof useGrounds>) {
  const [name, setName] = useState('')
  return <section>
    <h2>Ground settings</h2>
    {error && <p className="error" role="alert">{error}</p>}
    <form onSubmit={event => {
      event.preventDefault()
      if (addGround(name)) setName('')
    }}>
      <label>Ground name<input value={name} onChange={event => setName(event.target.value)} required maxLength={120} /></label>
      <button disabled={!ready}>Add ground</button>
    </form>
    {grounds.length ? <ul>{grounds.map(ground => <li key={ground.id}>{ground.name}</li>)}</ul> : <p>Add a ground to select when starting a match.</p>}
  </section>
}
