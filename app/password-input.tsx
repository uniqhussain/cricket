'use client'

import { useId, useState, type ComponentPropsWithoutRef } from 'react'

type PasswordInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'id'> & { label: string }

export default function PasswordInput({ label, disabled, ...inputProps }: PasswordInputProps) {
  const id = useId()
  const [visible, setVisible] = useState(false)

  return <div className="password-field">
    <label htmlFor={id}>{label}</label>
    <div className="password-control">
      <input {...inputProps} id={id} disabled={disabled} type={visible ? 'text' : 'password'} />
      <button type="button" className="password-toggle" disabled={disabled} aria-controls={id}
        aria-label={visible ? 'Hide password' : 'Show password'}
        onClick={() => setVisible(previous => !previous)}>
        <span className="password-eye" aria-hidden="true" />
        {!visible && <span className="password-eye-slash" aria-hidden="true" />}
      </button>
    </div>
  </div>
}
