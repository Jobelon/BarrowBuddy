import { useState } from 'react'
import type { FormEvent } from 'react'
import { AuthLayout } from './AuthLayout'
import { Field, PasswordField, ProfileFields, SubmitButton } from './AuthFields'
import { authErrorMessage, isCitEmail, passwordMinLength, readProfile, supabase } from './auth'

type Mode = 'login' | 'signup' | 'forgot' | 'reset'

const copy = {
  login: { title: 'Welcome back.', intro: 'Log in with your CIT institutional email.', submit: 'Log in' },
  signup: { title: 'Create your account.', intro: 'Use your institutional email to get started.', submit: 'Create account' },
  forgot: { title: 'Reset your password.', intro: 'We’ll send a reset link to your CIT email.', submit: 'Send reset link' },
  reset: { title: 'Choose a new password.', intro: 'Enter a new password for your BorrowBuddy account.', submit: 'Update password' },
}

export function AuthForm({ mode, invalidLink = false }: { mode: Mode; invalidLink?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const signup = mode === 'signup'
  const forgot = mode === 'forgot'
  const reset = mode === 'reset'
  const view = copy[mode]

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '').trim().toLowerCase()
    const password = String(data.get('password') ?? '')
    const profile = signup ? readProfile(Object.fromEntries(data)) : null

    if (!supabase) {
      setError('BorrowBuddy is missing its Supabase connection. Check the local app settings.')
      return
    }
    if (!reset && !isCitEmail(email)) {
      setError('Enter your CIT institutional email ending in @cit.edu.')
      return
    }
    if (signup && !profile) {
      setError('Enter your full name, student ID number, and program.')
      return
    }
    if (signup && password !== data.get('confirm_password')) {
      setError('Passwords do not match. Re-enter your password to confirm it.')
      return
    }

    setBusy(true)
    setError('')
    try {
      if (signup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: new URL('/login', window.location.origin).href,
            data: { borrowbuddy_profile: profile },
          },
        })
        if (error) setError(authErrorMessage(error, 'We couldn’t create your account. Check your details and try again.'))
        else setDone(true)
      } else if (forgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: new URL('/reset-password', window.location.origin).href,
        })
        if (error) setError(authErrorMessage(error, 'We couldn’t send the reset link. Try again.'))
        else setDone(true)
      } else if (reset) {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) setError(authErrorMessage(error, 'We couldn’t update your password. Request a new reset link and try again.'))
        else setDone(true)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setError(authErrorMessage(error, 'We couldn’t log you in. Try again.'))
      }
    } catch {
      setError('We couldn’t reach BorrowBuddy. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthLayout scene={signup ? 'pass' : 'exchange'}>
        <div role="status">
          <h1>{reset ? 'Password updated.' : 'Check your CIT inbox.'}</h1>
          <p className="intro">
            {reset ? 'Your new password is ready to use.' : forgot
              ? 'If your CIT email has an account, you’ll receive a link to reset your password.'
              : 'Follow the confirmation link to finish creating your BorrowBuddy account.'}
          </p>
        </div>
        <a className="primary-button" href="/login">{reset ? 'Continue to BorrowBuddy' : 'Back to log in'}</a>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout scene={signup ? 'pass' : 'exchange'}>
      <h1>{view.title}</h1>
      <p className="intro">{view.intro}</p>
      {invalidLink && !error && <p className="form-error" role="alert">
        {forgot ? 'This reset link is invalid or has expired. Request a new one below.' : 'This email link is invalid or has expired. Try logging in or requesting a new link.'}
      </p>}
      <form className="auth-form" onSubmit={submit} aria-busy={busy}>
        {signup && <ProfileFields />}
        {!reset && <Field label="Institutional email" name="email" type="email" autoComplete="username" placeholder="juan.delacruz@cit.edu" required />}
        {!forgot && <PasswordField creating={signup || reset} minLength={signup || reset ? passwordMinLength : undefined} />}
        {signup && <PasswordField creating confirmation />}
        {mode === 'login' && <a className="forgot-link" href="/forgot-password">Forgot password?</a>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <SubmitButton busy={busy}>{busy ? 'Please wait…' : view.submit}</SubmitButton>
      </form>
      {signup ? <p className="switch-link">Already have an account? <a href="/login">Log in</a></p>
        : mode === 'login' ? <p className="switch-link">New to BorrowBuddy? <a href="/signup">Create an account</a></p>
        : <p className="switch-link"><a href="/login">Back to log in</a></p>}
    </AuthLayout>
  )
}
