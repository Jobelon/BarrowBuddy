import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { ProfileDetails } from './auth'
import { Browse, Home, MyListings, Post } from './StudentListings'
import { StudentMessages } from './StudentInbox'
import { StudentProfile } from './StudentProfile'
import './StudentArea.css'

const pages = [
  { name: 'Home', path: '/home', icon: 'M3 10 12 3l9 7v10H3z M9 20v-7h6v7' },
  { name: 'Browse', path: '/browse', icon: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z' },
  { name: 'Post', path: '/post', icon: 'M12 5v14M5 12h14' },
  { name: 'Messages', path: '/messages', icon: 'M4 4h16v12H9l-5 4z M8 9h8 M8 12h5' },
  { name: 'Profile', path: '/profile', icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8' },
] as const
const studentRoutes = [...pages, { name: 'Messages', path: '/inbox' }, { name: 'Post', path: '/my-listings' }] as const

function currentStudentPage() {
  const path = window.location.pathname.replace(/\/$/, '')
  return studentRoutes.find((entry) => entry.path === path) ?? pages[0]
}

type StudentAreaProps = {
  client: SupabaseClient
  user: User
  profile: ProfileDetails
  signingOut: boolean
  signOutError: string
  onSignOut: () => void
  onProfileSaved: (profile: ProfileDetails) => void
}

export function StudentArea({ client, user, profile, signingOut, signOutError, onSignOut, onProfileSaved }: StudentAreaProps) {
  const [page, setPage] = useState(currentStudentPage)
  const firstName = profile.full_name.split(/\s+/)[0]

  useEffect(() => {
    if (window.location.pathname !== currentStudentPage().path) {
      window.history.replaceState(window.history.state, '', currentStudentPage().path)
    }
    const onPopState = () => setPage(currentStudentPage())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function navigate(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
      event.shiftKey || event.altKey || !(event.target instanceof Element)) return

    const link = event.target.closest<HTMLAnchorElement>('a[href]')
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return
    const next = studentRoutes.find((entry) => entry.path === link.getAttribute('href'))
    if (!next) return

    event.preventDefault()
    if (next.path === page.path) return
    window.history.pushState(null, '', next.path)
    setPage(next)
    window.scrollTo(0, 0)
  }

  return (
    <div className="student-shell" onClick={navigate}>
      <a className="student-skip" href="#student-main">Skip to content</a>
      <aside className="student-rail">
        <a className="student-brand" href="/home">
          <img src="/favicon.svg" width="38" height="38" alt="" />
          <span>BorrowBuddy<small>CAMPUS EXCHANGE</small></span>
        </a>
        <nav className="student-nav" aria-label="Student pages">
          {pages.map((entry) => (
            <a href={entry.path} key={entry.path} aria-current={page.name === entry.name ? 'page' : undefined}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={entry.icon} /></svg>
              <span>{entry.name}</span>
            </a>
          ))}
        </nav>
        <a className="student-identity" href="/profile">
          <span className="student-initial" aria-hidden="true">{firstName.slice(0, 1).toUpperCase()}</span>
          <span>{profile.full_name}<small>CIT student</small></span>
        </a>
      </aside>
      <header className="student-mobile-header">
        <a className="student-brand" href="/home"><img src="/favicon.svg" width="32" height="32" alt="" />BorrowBuddy</a>
        <a className="student-initial" href="/profile" aria-label="Open your profile">{firstName.slice(0, 1).toUpperCase()}</a>
      </header>
      <main className="student-main" id="student-main" tabIndex={-1}>
        {page.path === '/home' && <Home client={client} firstName={firstName} studentId={user.id} />}
        {page.path === '/browse' && <Browse client={client} studentId={user.id} />}
        {page.path === '/post' && <Post client={client} studentId={user.id} />}
        {page.path === '/my-listings' && <MyListings client={client} studentId={user.id} />}
        {page.name === 'Messages' && <StudentMessages client={client} studentId={user.id} showRequests={page.path === '/inbox'} />}
        {page.path === '/profile' && <StudentProfile client={client} user={user} profile={profile}
          onProfileSaved={onProfileSaved} onSignOut={onSignOut} signingOut={signingOut} signOutError={signOutError} />}
      </main>
    </div>
  )
}
