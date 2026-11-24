'use client'

import { useState } from 'react'
import type { Account } from './match'
import { battingHands, bowlingStyles, roles, type Profile } from './profile'
import { preparePlayerPhoto, uploadPlayerPhoto } from './player-photo'

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

  async function update(body: object | (() => Promise<object>), reset?: () => void, success = 'Saved.') {
    setBusy(true)
    setMessage('')
    try {
      const request = typeof body === 'function' ? await body() : body
      await sharedRequest('', { ...request, target: selection })
      reset?.()
      await reload()
      setMessage(success)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the changes.') }
    finally { setBusy(false) }
  }

  return <details open>
    <summary>{user.admin ? 'User settings' : 'My profile'}</summary>
    {message && <p role="status">{message}</p>}
    {user.admin && <details>
      <summary>Add player</summary>
      <form onSubmit={event => {
        event.preventDefault()
        const form = event.currentTarget
        const fields = new FormData(form)
        void update({
          operation: 'createPlayer', name: fields.get('name'), email: fields.get('email'), password: fields.get('password'),
        }, () => form.reset(), 'Player added. They can sign in with their email and password.')
      }}>
        <label>Player name<input name="name" required maxLength={80} disabled={busy} /></label>
        <label>Player email<input name="email" type="email" required maxLength={254} disabled={busy} /></label>
        <label>Initial password<input name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" disabled={busy} /></label>
        <button disabled={busy}>Add player</button>
      </form>
    </details>}
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
      void update(async () => {
        const file = form.get('photo')
        const photo = file instanceof File && file.size > 0
          ? await uploadPlayerPhoto(await preparePlayerPhoto(file))
          : form.has('removePhoto') ? '' : undefined
        return {
          operation: 'profile', name: form.get('name'), nickname: form.get('nickname'),
          details: {
            role: form.get('role'), batting: form.get('batting'), bowling: form.get('bowling'),
            jersey: form.get('jersey'), isCaptain: form.has('isCaptain'), photo,
          },
        }
      })
    }}>
      <label>Full name<input name="name" defaultValue={selected?.name} required maxLength={80} disabled={busy} /></label>
      <label>Nickname<input name="nickname" defaultValue={selected?.nickname} maxLength={40} disabled={busy} /></label>
      <fieldset disabled={busy}>
        <legend>Cricket details</legend>
        <label>Role<select name="role" defaultValue={selected?.details.role ?? ''}>
          <option value="">Choose a role</option>
          {roles.map(role => <option key={role}>{role}</option>)}
        </select></label>
        <label>Jersey number<input name="jersey" inputMode="numeric" pattern="[0-9]{0,3}" maxLength={3} defaultValue={selected?.details.jersey} /></label>
        <label>Batting hand<select name="batting" defaultValue={selected?.details.batting ?? ''}>
          <option value="">Choose a batting hand</option>
          {battingHands.map(hand => <option key={hand}>{hand}</option>)}
        </select></label>
        <label>Bowling style<select name="bowling" defaultValue={selected?.details.bowling ?? ''}>
          <option value="">Choose a bowling style</option>
          {bowlingStyles.map(style => <option key={style}>{style}</option>)}
        </select></label>
        <label className="captain-option"><input name="isCaptain" type="checkbox" defaultChecked={selected?.details.isCaptain} /> Captain</label>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Profile photo</legend>
        {selected?.details.photo && <>
          <div className="player-card"><img src={selected.details.photo} alt="Current profile photo" width={72} height={72} /></div>
          <label className="captain-option"><input name="removePhoto" type="checkbox" /> Remove current photo</label>
        </>}
        <label>{selected?.details.photo ? 'Replace photo' : 'Choose photo'}<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></label>
        <p className="muted">JPEG, PNG, or WebP, up to 8 MB.</p>
      </fieldset>
      <div className="actions">
        <button disabled={busy}>{selected ? 'Save profile' : 'Create profile'}</button>
        {user.admin && selected && <button type="button" disabled={busy} onClick={() => {
          if (window.confirm('Remove this cricket profile? The login and past match records will be kept.'))
            void update({ operation: 'removeProfile' })
        }}>Remove profile</button>}
        {user.admin && selection !== user.id && account && !account.owner && !account.disabled && <button type="button" disabled={busy}
          onClick={() => void update({ operation: 'role', enabled: !account.admin })}>
          {account.admin ? 'Remove admin access' : 'Make admin'}
        </button>}
      </div>
    </form>
    {user.admin && <details>
      <summary>Create admin login</summary>
      <form onSubmit={event => {
        event.preventDefault()
        const form = event.currentTarget
        const fields = new FormData(form)
        void update({
          operation: 'createLogin',
          username: fields.get('username'),
          password: fields.get('password'),
          role: 'admin',
        }, () => form.reset(), 'Login created. The user can now sign in with the credentials you chose.')
      }}>
        <label>User ID<input name="username" required minLength={3} maxLength={40} autoComplete="off" /></label>
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
