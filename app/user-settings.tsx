'use client'

import { useState } from 'react'
import type { Account } from './match'

export type Profile = { user_id: string; name: string; nickname: string }
export type SessionUser = { id: string; admin: boolean }

export async function sharedRequest<T>(query = '', body?: object): Promise<T> {
  const response = await fetch('/api/shared-scoring' + query, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : { cache: 'no-store' })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'Could not update shared scoring.')
  return result as T
}

export default function UserSettings({ user, profile, accounts, profiles, reload }: {
  user: SessionUser
  profile: Profile | null
  accounts: Account[]
  profiles: Profile[]
  reload: () => Promise<void>
}) {
  const [selection, setSelection] = useState(user.id)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const account = accounts.find(item => item.id === selection)
  const selected = selection === user.id ? profile : profiles.find(item => item.user_id === selection)

  async function update(body: object, reset?: () => void) {
    setBusy(true)
    setMessage('')
    try {
      await sharedRequest('', { ...body, target: selection })
      reset?.()
      await reload()
      setMessage('Saved.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the changes.') }
    finally { setBusy(false) }
  }

  return <details>
    <summary>{user.admin ? 'User settings' : 'My profile'}</summary>
    {user.admin && <label>Choose a verified user
      <select value={selection} disabled={busy} onChange={event => { setSelection(event.target.value); setMessage('') }}>
        <option value={user.id}>My profile</option>
        {accounts.filter(item => item.id !== user.id).map(item =>
          <option value={item.id} key={item.id}>{item.label}{item.admin ? ' · Admin' : ''}{item.disabled ? ' · Disabled' : ''}</option>)}
      </select>
    </label>}
    <form key={selection + JSON.stringify(selected)} onSubmit={event => {
      event.preventDefault()
      const form = new FormData(event.currentTarget)
      void update({ operation: 'profile', name: form.get('name'), nickname: form.get('nickname') })
    }}>
      <label>Full name<input name="name" defaultValue={selected?.name} required maxLength={80} disabled={busy} /></label>
      <label>Nickname<input name="nickname" defaultValue={selected?.nickname} maxLength={40} disabled={busy} /></label>
      <div className="actions">
        <button disabled={busy}>{selected ? 'Save profile' : 'Create profile'}</button>
        {user.admin && selected && <button type="button" disabled={busy} onClick={() => {
          if (window.confirm('Remove this cricket profile? The login and past match records will be kept.'))
            void update({ operation: 'removeProfile' })
        }}>Remove profile</button>}
        {user.admin && account && !account.owner && !account.disabled && <button type="button" disabled={busy}
          onClick={() => void update({ operation: 'role', enabled: !account.admin })}>
          {account.admin ? 'Remove admin access' : 'Make admin'}
        </button>}
      </div>
      {message && <p role="status">{message}</p>}
    </form>
    {user.admin && <details>
      <summary>Create player login</summary>
      <form onSubmit={event => {
        event.preventDefault()
        const form = event.currentTarget
        const fields = new FormData(form)
        void update({ operation: 'createLogin', username: fields.get('username'), password: fields.get('password') }, () => form.reset())
      }}>
        <label>Player user ID<input name="username" required minLength={3} maxLength={40} autoComplete="off" /></label>
        <label>Initial password<input name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" /></label>
        <button disabled={busy}>Create login</button>
      </form>
    </details>}
    {user.admin && account?.player_login && !account.admin && !account.owner && selection !== user.id && <details>
      <summary>Manage player login</summary>
      <form onSubmit={event => {
        event.preventDefault()
        const form = event.currentTarget
        void update({ operation: 'resetLogin', password: new FormData(form).get('password') }, () => form.reset())
      }}>
        <label>New password<input name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" /></label>
        <button disabled={busy}>Reset password</button>
      </form>
      <button disabled={busy} onClick={() => void update({ operation: 'disableLogin', disabled: !account.disabled })}>
        {account.disabled ? 'Enable login' : 'Disable login'}
      </button>
    </details>}
  </details>
}
