'use client'

import { useState } from 'react'
import { accountRoles, type Account, type AccountRole } from './match'
import { battingHands, bowlingStyles, roles, type Profile } from './profile'
import { preparePlayerPhoto, uploadPlayerPhoto } from './player-photo'
import PasswordInput from './password-input'
import { minAdminPasswordLength, minPlayerPasswordLength } from './player-login'

export type SessionUser = { id: string; admin: boolean; role: AccountRole }
type SettingsView = 'add' | 'manage' | 'profile'
const roleDescriptions: Record<AccountRole, string> = {
  player: 'Can view assigned matches and edit their own profile.',
  umpire: 'Can score assigned matches and edit their own profile.',
  admin: 'Can manage users, score any shared match, and correct frozen overs.',
}

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
  const [view, setView] = useState<SettingsView>(user.admin ? 'add' : 'profile')
  const [selection, setSelection] = useState('')
  const [newRole, setNewRole] = useState<AccountRole>('player')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const activeView = user.admin ? view : 'profile'
  const target = activeView === 'profile' ? user.id : selection
  const account = accounts.find(item => item.id === selection)
  const selected = activeView === 'profile' ? profile : profiles.find(item => item.user_id === selection)
  const userNames = new Map(profiles.map(item => [item.user_id, item.name]))
  const passwordMinimum = newRole === 'admin' ? minAdminPasswordLength : minPlayerPasswordLength

  async function update(body: object | (() => Promise<object>), reset?: () => void, success = 'Saved.') {
    setBusy(true)
    setNotice(null)
    try {
      const request = typeof body === 'function' ? await body() : body
      await sharedRequest('', { ...request, target })
      reset?.()
      const refreshed = await reload().then(() => true, () => false)
      setNotice({ text: refreshed ? success : success + ' Refresh the page to see the latest details.' })
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'Could not save the changes.', error: true })
    }
    finally { setBusy(false) }
  }

  return <div className="user-settings">
    {user.admin && <nav className="settings-nav" aria-label="User settings">
      {(['add', 'manage', 'profile'] as const).map(tab => <button key={tab} type="button" aria-pressed={activeView === tab}
        disabled={busy} onClick={() => {
          if (tab === activeView) return
          setView(tab)
          setNotice(null)
          if (tab === 'manage') void reload().catch(() => {
            setNotice({ text: 'Could not refresh the user list. Refresh the page to try again.', error: true })
          })
        }}>
        {{ add: 'Add player', manage: 'Manage users', profile: 'My profile' }[tab]}
      </button>)}
    </nav>}
    {notice && <p className={notice.error ? 'error' : 'settings-success'} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
    {activeView === 'add' && <>
      <form onSubmit={event => {
        event.preventDefault()
        const form = event.currentTarget
        const fields = new FormData(form)
        void update({
          operation: 'createPlayer', name: fields.get('name'), email: fields.get('email'),
          password: fields.get('password'), role: newRole,
        }, () => { form.reset(); setNewRole('player') }, 'Account created as ' + accountRoles[newRole] + '. They can now sign in by email.')
      }}>
        <div className="grid settings-grid">
          <label>Full name<input name="name" required maxLength={80} disabled={busy} /></label>
          <label>Email<input name="email" type="email" required maxLength={254} disabled={busy} /></label>
        </div>
        <label>Account role<select name="role" value={newRole} disabled={busy} aria-describedby="new-role-help"
          onChange={event => setNewRole(event.target.value as AccountRole)}>
          {(['player', 'umpire', 'admin'] as const).map(role => <option key={role} value={role}>{accountRoles[role]}</option>)}
        </select></label>
        <p className="muted settings-hint" id="new-role-help">{roleDescriptions[newRole]}</p>
        <PasswordInput label="Initial password" name="password" required minLength={passwordMinimum} maxLength={72}
          autoComplete="new-password" disabled={busy} aria-describedby="new-password-help" />
        <p className="muted settings-hint" id="new-password-help">At least {passwordMinimum} characters.</p>
        <button disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </>}
    {activeView === 'manage' && <label>Select a user
        <select value={selection} disabled={busy} onChange={event => { setSelection(event.target.value); setNotice(null) }}>
          <option value="">Choose a user</option>
          {accounts.filter(item => item.id !== user.id).map(item => {
            const name = userNames.get(item.id)
            return <option value={item.id} key={item.id}>
              {name ? name + ' (' + item.label + ')' : item.label} · {accountRoles[item.role]}{item.disabled ? ' · Disabled' : ''}
            </option>
          })}
        </select>
      </label>}
    {activeView === 'manage' && account && !account.owner && !account.disabled && <form className="settings-group"
      key={account.id + ':' + account.role}
      onSubmit={event => {
        event.preventDefault()
        const fields = new FormData(event.currentTarget)
        void update({ operation: 'role', role: fields.get('role') }, undefined, 'Account role updated.')
      }}>
      <label>Account role<select name="role" defaultValue={account.role} disabled={busy}>
        {Object.entries(accountRoles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button disabled={busy}>Save role</button>
    </form>}
    {(activeView === 'profile' || (activeView === 'manage' && account)) && <details
      className="settings-group" key={target} open={activeView === 'profile' || undefined}>
    <summary>{activeView === 'profile' ? 'Profile details' : 'Edit cricket profile'}</summary>
    {activeView === 'profile' && <p className="muted">Account role: {accountRoles[user.role]}</p>}
    <form key={target + JSON.stringify(selected)} onSubmit={event => {
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
        <label>Playing position<select name="role" defaultValue={selected?.details.role ?? ''}>
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
      </div>
    </form>
    </details>}
    {activeView === 'add' && <details className="settings-group">
      <summary>Create admin with a user ID</summary>
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
        <PasswordInput label="Initial password" name="password" required minLength={minAdminPasswordLength} maxLength={72} autoComplete="new-password" disabled={busy} />
        <button disabled={busy}>Create login</button>
      </form>
    </details>}
    {activeView === 'manage' && account?.player_login && !account.admin && !account.owner && <details className="settings-group">
      <summary>Password and sign-in access</summary>
      <form onSubmit={event => {
        event.preventDefault()
        const form = event.currentTarget
        void update({ operation: 'resetLogin', password: new FormData(form).get('password') }, () => form.reset())
      }}>
        <PasswordInput label="New password" name="password" required minLength={minPlayerPasswordLength} maxLength={72} autoComplete="new-password" disabled={busy} />
        <button disabled={busy}>Reset password</button>
      </form>
      <button disabled={busy} onClick={() => void update({ operation: 'disableLogin', disabled: !account.disabled })}>
        {account.disabled ? 'Enable login' : 'Disable login'}
      </button>
    </details>}
  </div>
}
