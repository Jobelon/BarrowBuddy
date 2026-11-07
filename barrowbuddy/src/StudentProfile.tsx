import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { ProfileFields, SubmitButton } from './AuthFields'
import { profileColumns, readProfile } from './auth'
import type { ProfileDetails } from './auth'

const imageTypes = ['image/jpeg', 'image/png', 'image/webp']
const pictureBucket = 'profile-pictures'

type ProfileProps = {
  client: SupabaseClient; user: User; profile: ProfileDetails
  onProfileSaved: (profile: ProfileDetails) => void
  onSignOut: () => void; signingOut: boolean; signOutError: string
}

export function StudentProfile({ client, user, profile, onProfileSaved, onSignOut, signingOut, signOutError }: ProfileProps) {
  const [picture, setPicture] = useState<Blob | null>(null)
  const pictureImage = useRef<HTMLImageElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const id = user.id

  useEffect(() => {
    let active = true
    async function loadPicture() {
      const { data } = await client.from('profiles').select('avatar_path').eq('id', id).maybeSingle()
      if (!active || !data?.avatar_path) return
      const { data: avatar } = await client.storage.from(pictureBucket).download(data.avatar_path)
      if (active) setPicture((current) => current ?? avatar)
    }
    void loadPicture().catch(() => {})
    return () => { active = false }
  }, [client, id])

  useEffect(() => {
    if (!picture || !pictureImage.current) return
    const url = URL.createObjectURL(picture)
    pictureImage.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [picture])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || signingOut) return
    const form = event.currentTarget
    const data = new FormData(form)
    const details = readProfile(Object.fromEntries(data))
    const file = data.get('picture')
    if (!details) { setError('Enter your full name, student ID number, and program.'); return }
    const upload = file instanceof File && file.size > 0 ? file : null
    if (upload && (!imageTypes.includes(upload.type) || upload.size > 5 * 1024 * 1024)) {
      setError('Choose a JPEG, PNG, or WebP image up to 5 MB.')
      return
    }

    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { data, error } = await client.from('profiles').update(details).eq('id', id).select(profileColumns).single()
      const saved = readProfile(data)
      if (error || !saved) throw error ?? new Error('Profile unavailable')
      onProfileSaved(saved)
      setMessage('Profile saved.')
    } catch {
      setError('Couldn’t save your profile. Check your student ID and try again.')
      setBusy(false)
      return
    }
    try {
      if (upload) {
        const path = id + '/avatar'
        const { error } = await client.storage.from(pictureBucket).upload(path, upload, {
          upsert: true, contentType: upload.type, cacheControl: '0',
        })
        if (error) throw error
        const { error: saveError } = await client.from('profiles').update({ avatar_path: path }).eq('id', id)
          .select('avatar_path').single()
        if (saveError) throw saveError
        setPicture(upload)
        const input = form.elements.namedItem('picture')
        if (input instanceof HTMLInputElement) input.value = ''
      }
    } catch {
      setError('Your profile details were saved. Try uploading your picture again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="student-page-heading">
        <p className="student-eyebrow">Your account</p>
        <h1>Profile</h1>
        <p>Manage your student details and profile picture.</p>
      </div>
      <section className="student-panel student-form-panel">
        <div className="student-profile-identity">
          {picture ? <img ref={pictureImage} alt="Your profile picture" width="64" height="64" />
            : <span className="student-initial" aria-hidden="true">{profile.full_name.slice(0, 1).toUpperCase()}</span>}
          <div><h2>{profile.full_name}</h2><p className="student-muted">{user.email}</p></div>
          <span className="student-pill" data-status="available">Verified CIT email</span>
        </div>
        <form className="auth-form" onSubmit={submit} aria-busy={busy}>
          <ProfileFields profile={profile} />
          <div className="field">
            <label htmlFor="picture">Profile picture <span className="student-muted">(optional)</span></label>
            <input type="file" id="picture" name="picture" accept={imageTypes.join(',')} aria-describedby="picture-help" />
            <small id="picture-help" className="student-muted">JPEG, PNG, or WebP up to 5 MB.</small>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && !error && <p className="student-feedback" role="status">{message}</p>}
          <SubmitButton busy={busy || signingOut}>{busy ? 'Saving…' : 'Save profile'}</SubmitButton>
        </form>
        {signOutError && <p className="form-error" role="alert">{signOutError}</p>}
        <button type="button" className="text-button" disabled={busy || signingOut} onClick={onSignOut}>Sign out</button>
      </section>
    </>
  )
}
