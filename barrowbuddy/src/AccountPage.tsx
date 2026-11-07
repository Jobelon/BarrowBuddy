import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { ProfileFields, SubmitButton } from './AuthFields'
import { AuthLayout } from './AuthLayout'
import { profileColumns, readProfile } from './auth'
import type { ProfileDetails } from './auth'
import { StudentArea } from './StudentArea'

type ProfileState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'complete'; profile: ProfileDetails }
  | { kind: 'incomplete'; profile?: Partial<ProfileDetails>; exists: boolean }

async function fetchProfile(client: SupabaseClient, id: string) {
  const { data, error } = await client.from('profiles').select(profileColumns).eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

async function saveProfile(client: SupabaseClient, id: string, fields: ProfileDetails, exists: boolean) {
  const table = client.from('profiles')
  const request = exists ? table.update(fields).eq('id', id) : table.insert(fields)
  const { data, error } = await request.select(profileColumns).single()
  if (!error) return readProfile(data)

  // A confirmation link and an existing session can finish onboarding in different tabs.
  if (!exists && error.code === '23505') return readProfile(await fetchProfile(client, id))
  return null
}

export function AccountPage({ client, user }: { client: SupabaseClient; user: User }) {
  const [draft] = useState(() => readProfile(user.user_metadata.borrowbuddy_profile))
  const [hasDraftMetadata] = useState(() => Object.hasOwn(user.user_metadata, 'borrowbuddy_profile'))
  const [status, setStatus] = useState<ProfileState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const id = user.id

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const existing = await fetchProfile(client, id)
        if (!active) return
        const saved = readProfile(existing) ?? (draft ? await saveProfile(client, id, draft, Boolean(existing)) : null)
        if (!active) return

        if (saved) {
          setStatus({ kind: 'complete', profile: saved })
          if (hasDraftMetadata) await client.auth.updateUser({ data: { borrowbuddy_profile: null } })
        } else {
          setStatus({ kind: 'incomplete', exists: Boolean(existing), profile: draft ?? existing ?? undefined })
        }
      } catch {
        if (active) setStatus({ kind: 'error' })
      }
    }
    void load()
    return () => { active = false }
  }, [attempt, client, draft, hasDraftMetadata, id])

  async function completeProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || status.kind !== 'incomplete') return
    const fields = readProfile(Object.fromEntries(new FormData(event.currentTarget)))
    if (!fields) {
      setError('Enter your full name, student ID number, and program.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const saved = await saveProfile(client, id, fields, status.exists)
      if (!saved) {
        setError('We couldn’t save your profile. Check your student ID and try again.')
        return
      }
      setStatus({ kind: 'complete', profile: saved })
      if (hasDraftMetadata) await client.auth.updateUser({ data: { borrowbuddy_profile: null } })
    } catch {
      setError('We couldn’t reach BorrowBuddy. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setBusy(true)
    const { error } = await client.auth.signOut({ scope: 'local' })
    if (error) {
      setError('We couldn’t sign you out. Try again.')
      setBusy(false)
      return
    }
    window.location.replace('/login')
  }

  if (status.kind === 'complete') {
    return <StudentArea client={client} user={user} profile={status.profile} onSignOut={signOut}
      signingOut={busy} signOutError={error} onProfileSaved={(profile) => setStatus({ kind: 'complete', profile })} />
  }

  return (
    <AuthLayout scene="pass">
      {status.kind === 'loading' && <p role="status">Opening your student profile…</p>}
      {status.kind === 'error' && <>
        <h1>We couldn’t open your profile.</h1>
        <p className="intro">Check your connection and try again.</p>
        <button className="primary-button" type="button" onClick={() => {
          setStatus({ kind: 'loading' })
          setAttempt(attempt + 1)
        }}>Retry</button>
      </>}
      {status.kind === 'incomplete' && <>
        <h1>Complete your profile.</h1>
        <p className="intro">Add your student details to finish setting up BorrowBuddy.</p>
        <form className="auth-form" onSubmit={completeProfile} aria-busy={busy}>
          <ProfileFields profile={status.profile} />
          <SubmitButton busy={busy}>{busy ? 'Please wait…' : 'Save profile'}</SubmitButton>
        </form>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="text-button" type="button" disabled={busy} onClick={signOut}>Sign out</button>
    </AuthLayout>
  )
}
