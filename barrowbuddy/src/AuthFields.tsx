import { useState } from 'react'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import type { ProfileDetails } from './auth'

export function Field({ label, name, children, ...props }: ComponentPropsWithoutRef<'input'> & { label: string; name: string; children?: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <div className={children ? 'input-wrap input-with-control' : 'input-wrap'}>
        <input {...props} id={name} name={name} />
        {children}
      </div>
    </div>
  )
}

export function PasswordField({ creating, minLength, confirmation = false }: { creating: boolean; minLength?: number; confirmation?: boolean }) {
  const [visible, setVisible] = useState(false)
  return (
    <Field
      label={confirmation ? 'Confirm password' : 'Password'}
      name={confirmation ? 'confirm_password' : 'password'}
      type={visible ? 'text' : 'password'}
      autoComplete={creating ? 'new-password' : 'current-password'}
      placeholder={confirmation ? 'Re-enter your password' : creating ? `At least ${minLength} characters` : 'Enter your password'}
      minLength={minLength}
      required
    >
      <button
        type="button"
        className="password-toggle"
        aria-label={`${visible ? 'Hide' : 'Show'} ${confirmation ? 'password confirmation' : 'password'}`}
        onClick={() => setVisible(!visible)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
          <circle cx="12" cy="12" r="2.4" />
          {visible && <path d="m4 4 16 16" />}
        </svg>
      </button>
    </Field>
  )
}

export function ProfileFields({ profile }: { profile?: Partial<ProfileDetails> }) {
  return (
    <>
      <div className="field-pair">
        <Field label="Full name" name="full_name" autoComplete="name" placeholder="Juan Dela Cruz" maxLength={80} defaultValue={profile?.full_name} required />
        <Field label="Student ID number" name="student_id_number" autoComplete="off" placeholder="12-3456-789" maxLength={64} defaultValue={profile?.student_id_number} required />
      </div>
      <Field label="Program" name="program" placeholder="e.g. BS in Computer Engineering" maxLength={120} defaultValue={profile?.program} required />
    </>
  )
}

export function SubmitButton({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <button type="submit" className="primary-button" disabled={busy}>
      {children}
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 10h12m-4-4 4 4-4 4" />
      </svg>
    </button>
  )
}
