import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { ProfileDetails } from './auth'
import { Browse, Home, MyListings, Post } from './StudentListings'
import { StudentMessages } from './StudentInbox'
import { StudentProfile } from './StudentProfile'
import { CreditScorePage } from './CreditScore'
import './StudentArea.css'

const pages = [
  { name: 'Home', path: '/home', icon: 'M3 10 12 3l9 7v10H3z M9 20v-7h6v7' },
  { name: 'Browse', path: '/browse', icon: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z' },
  { name: 'Post', path: '/post', icon: 'M12 5v14M5 12h14' },
  { name: 'Messages', path: '/messages', icon: 'M4 4h16v12H9l-5 4z M8 9h8 M8 12h5' },
  { name: 'Profile', path: '/profile', icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8' },
  { name: 'My Credit Score', path: '/credit', icon: 'M4 17a9 9 0 1 1 16 0 M12 13l4-4 M8 19h8' },
] as const
const studentRoutes = [...pages, { name: 'Messages', path: '/inbox' }, { name: 'Post', path: '/my-listings' }] as const

function currentStudentPage() {
  const path = window.location.pathname.replace(/\/$/, '')
  return studentRoutes.find((entry) => entry.path === path) ?? pages[0]
}

function BorrowNotifications({ count, active, compact = false }: {
  count: number; active: boolean; compact?: boolean
}) {
  return <a className="student-notification" href="/inbox" aria-current={active ? 'page' : undefined}
    aria-label={`${count} pending ${count === 1 ? 'request' : 'requests'} to borrow your items`}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9M10 21h4" />
    </svg>
    {!compact && <span>Borrow requests</span>}
    {count > 0 && <span className="student-notification-count" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
  </a>
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
  const [pendingCount, setPendingCount] = useState(0)
  const firstName = profile.full_name.split(/\s+/)[0]

  useEffect(() => {
    let active = true
    async function loadPendingCount() {
      const { count, error } = await client.from('borrow_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending').neq('borrower_id', user.id)
      if (active && !error) setPendingCount(count ?? 0)
    }
    const refresh = () => { void loadPendingCount().catch(() => {}) }
    refresh()
    const timer = window.setInterval(refresh, 15_000)
    window.addEventListener('focus', refresh)
    window.addEventListener('borrow-requests-changed', refresh)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('borrow-requests-changed', refresh)
    }
  }, [client, user.id])

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
        <div className="student-mobile-actions">
          <a className="student-initial" href="/profile" aria-label="Open your profile">{firstName.slice(0, 1).toUpperCase()}</a>
          <BorrowNotifications count={pendingCount} active={page.path === '/inbox'} compact />
        </div>
      </header>
      <main className="student-main" id="student-main" tabIndex={-1}>
        <div className="student-top-actions">
          <BorrowNotifications count={pendingCount} active={page.path === '/inbox'} compact />
        </div>
        {page.path === '/home' && <Home client={client} firstName={firstName} studentId={user.id} />}
        {page.path === '/browse' && <Browse client={client} studentId={user.id} />}
        {page.path === '/post' && <Post client={client} studentId={user.id} />}
        {page.path === '/my-listings' && <MyListings client={client} studentId={user.id} />}
        {page.name === 'Messages' && <StudentMessages client={client} studentId={user.id} showRequests={page.path === '/inbox'} />}
        {page.path === '/profile' && <StudentProfile client={client} user={user} profile={profile}
          onProfileSaved={onProfileSaved} onSignOut={onSignOut} signingOut={signingOut} signOutError={signOutError} />}
        {page.path === '/credit' && <CreditScorePage client={client} studentId={user.id} />}
      </main>
    </div>
  )
}
