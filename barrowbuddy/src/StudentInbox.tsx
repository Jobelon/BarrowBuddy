import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ListingConversations } from './ListingMessages'

type BorrowRequest = {
  id: string
  borrower_id: string
  created_at: string
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'returned'
  item: { name: string; owner_id: string } | null
}
type Action = 'accept' | 'decline' | 'cancel' | 'return'
const actionLabels: Record<Action, string> = {
  accept: 'Approve', decline: 'Decline', cancel: 'Cancel request', return: 'Mark returned',
}
const pageSize = 12

export function StudentMessages({ client, studentId, showRequests }: {
  client: SupabaseClient; studentId: string; showRequests: boolean
}) {
  return (
    <>
      <div className="student-page-heading">
        <p className="student-eyebrow">Your activity</p>
        <h1>{showRequests ? 'Borrow requests' : 'Messages'}</h1>
        <p>{showRequests ? 'Track requests you’ve sent and manage requests for your items.'
          : 'Chat privately with other CIT students about items and pickup details.'}</p>
      </div>
      <nav className="inbox-filters" aria-label="Messages and requests">
        <a href="/messages" aria-current={showRequests ? undefined : 'page'}>Conversations</a>
        <a href="/inbox" aria-current={showRequests ? 'page' : undefined}>Borrow requests</a>
      </nav>
      {showRequests ? <BorrowRequests client={client} studentId={studentId} />
        : <ListingConversations client={client} studentId={studentId} />}
    </>
  )
}

function BorrowRequests({ client, studentId }: { client: SupabaseClient; studentId: string }) {
  const [direction, setDirection] = useState<'received' | 'sent'>('received')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<BorrowRequest[] | 'loading' | 'error'>('loading')
  const [names, setNames] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const received = direction === 'received'

  useEffect(() => {
    let active = true
    async function load() {
      setResult('loading')
      const start = page * pageSize
      const query = client.from('borrow_requests').select('id, borrower_id, created_at, status, item:items(name, owner_id)')
        .order('created_at', { ascending: false }).order('id').range(start, start + pageSize)
      try {
        const { data, error } = await (received ? query.neq('borrower_id', studentId) : query.eq('borrower_id', studentId))
          .overrideTypes<BorrowRequest[], { merge: false }>()
        if (!active) return
        setResult(error || !data ? 'error' : data)
        if (!data?.length) return
        const ids = new Set(data.slice(0, pageSize).map((request) => received ? request.borrower_id : request.item?.owner_id))
        ids.delete(undefined)
        const results = await Promise.allSettled([...ids].map(async (id) => {
          const { data: name } = await client.rpc('get_profile_name', { p_profile_id: id })
          return [id, name] as const
        }))
        if (active) {
          const resolved: Record<string, string> = {}
          for (const lookup of results) {
            if (lookup.status !== 'fulfilled') continue
            const [id, name] = lookup.value
            if (id && typeof name === 'string') resolved[id] = name
          }
          setNames(resolved)
        }
      } catch {
        if (active) setResult('error')
      }
    }
    void load()
    return () => { active = false }
  }, [client, studentId, received, revision, page])

  async function updateRequest(id: string, action: Action) {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { error } = await client.rpc('update_borrow_request', { p_request_id: id, p_action: action })
      if (error) throw error
      setMessage('Request updated.')
    } catch {
      setError('Couldn’t update this request. Check its current status and try again.')
    } finally {
      setRevision((value) => value + 1)
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="inbox-filters" aria-label="Request direction" role="group">
        {(['received', 'sent'] as const).map((option) => (
          <button type="button" key={option} aria-pressed={direction === option} disabled={busy} onClick={() => {
            setDirection(option)
            setPage(0)
            setError('')
            setMessage('')
          }}>{option === 'received' ? 'Received' : 'Sent'}</button>
        ))}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="student-feedback" role="status">{message}</p>}
      {result === 'loading' && <p className="student-empty" role="status">Loading requests…</p>}
      {result === 'error' && <div className="student-empty" role="alert">
        <p>Couldn’t load requests.</p>
        <button className="student-secondary" onClick={() => setRevision(revision + 1)}>Try again</button>
      </div>}
      {Array.isArray(result) && <>
        {!result.length && <p className="student-empty">No {direction} requests yet.</p>}
        <div className="request-list">
          {result.slice(0, pageSize).map((request) => {
            const otherStudent = received ? request.borrower_id : request.item?.owner_id
            const name = otherStudent && names[otherStudent]
            const actions: Action[] = request.status === 'pending'
              ? received ? ['accept', 'decline'] : ['cancel']
              : received && request.status === 'accepted' ? ['return'] : []
            return (
              <article className="student-panel request-row" key={request.id}>
                <div>
                  <h2>{request.item?.name ?? 'Borrow request'}</h2>
                  {name && <p className="student-muted request-person">{received ? 'From' : 'To'} {name}</p>}
                  <time dateTime={request.created_at}>{new Date(request.created_at).toLocaleDateString()}</time>
                </div>
                <span className="student-pill" data-status={request.status}>{request.status}</span>
                {actions.length > 0 && <div className="student-actions">
                  {actions.map((action) => <button key={action} type="button"
                    className={action === 'accept' || action === 'return' ? 'student-primary' : 'student-secondary'}
                    disabled={busy} onClick={() => void updateRequest(request.id, action)}>{actionLabels[action]}</button>)}
                </div>}
              </article>
            )
          })}
        </div>
        {(page > 0 || result.length > pageSize) && <div className="student-actions student-pagination">
          <button className="student-secondary" disabled={page === 0 || busy} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page + 1}</span>
          <button className="student-secondary" disabled={result.length <= pageSize || busy} onClick={() => setPage(page + 1)}>Next</button>
        </div>}
      </>}
    </div>
  )
}
