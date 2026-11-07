import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AccountPage } from './AccountPage'
import { AuthForm } from './AuthForm'
import { AuthLayout } from './AuthLayout'
import { isCitEmail, supabase } from './auth'
import './App.css'

const route = window.location.pathname.replace(/\/$/, '')
const linkError = [window.location.search, window.location.hash.slice(1)].some((part) =>
  new URLSearchParams(part).has('error'),
)

function App() {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)
  const [recovery, setRecovery] = useState(route === '/reset-password')

  useEffect(() => {
    if (!supabase) return

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(nextSession)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const user = session?.user
  const verifiedStudent = user?.email && user.email_confirmed_at && isCitEmail(user.email)
  const signup = route === '/signup'

  if (session === undefined) {
    return <AuthLayout scene={signup ? 'pass' : 'exchange'}><p role="status">Loading BorrowBuddy…</p></AuthLayout>
  }

  if (recovery) {
    return <AuthForm mode={verifiedStudent ? 'reset' : 'forgot'} invalidLink={!verifiedStudent} />
  }

  if (user && verifiedStudent && supabase) {
    return <AccountPage key={user.id} client={supabase} user={user} />
  }

  if (user && supabase) {
    return (
      <AuthLayout scene="pass">
        <h1>Confirm your CIT email.</h1>
        <p className="intro">A verified @cit.edu email is required to use BorrowBuddy.</p>
        <button type="button" className="text-button" onClick={async () => {
          await supabase?.auth.signOut({ scope: 'local' })
        }}>Sign out</button>
      </AuthLayout>
    )
  }

  const mode = signup ? 'signup' : route === '/forgot-password' ? 'forgot' : 'login'
  return <AuthForm mode={mode} invalidLink={linkError} />
}

export default App
