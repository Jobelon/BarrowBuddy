import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type Thread = {
  id: string
  item_id: string
  borrower_id: string
  item: { name: string; owner_id: string; category: string; description: string; is_available: boolean } | null
  other_name: string | null
  last_message: string | null
  activity_at: string
  total_count: number
}

type Message = { id: string; sender_id: string; body: string; created_at: string }
const messagePageSize = 40
const threadPageSize = 20

export function MessageThread({ client, studentId, itemId, borrowerId }: {
  client: SupabaseClient; studentId: string; itemId: string; borrowerId: string
}) {
  const [messages, setMessages] = useState<Message[] | 'loading' | 'error'>('loading')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [today] = useState(() => new Date().toDateString())
  const pendingMessage = useRef<{ id: string; body: string } | null>(null)
  const transcript = useRef<HTMLDivElement>(null)
  const visibleMessages = Array.isArray(messages) ? messages.slice(0, messagePageSize).reverse() : []

  useEffect(() => {
    let active = true
    async function load() {
      const start = page * messagePageSize
      try {
        const { data, error } = await client.from('listing_messages')
          .select('id, sender_id, body, created_at, thread:listing_threads!inner(item_id, borrower_id)')
          .eq('thread.item_id', itemId).eq('thread.borrower_id', borrowerId)
          .order('created_at', { ascending: false }).order('id')
          .range(start, start + messagePageSize)
          .overrideTypes<Message[], { merge: false }>()
        if (active) setMessages(error || !data ? 'error' : data)
      } catch {
        if (active) setMessages('error')
      }
    }
    void load()
    return () => { active = false }
  }, [client, itemId, borrowerId, revision, page])

  useEffect(() => {
    if (page === 0 && Array.isArray(messages) && transcript.current) {
      transcript.current.scrollTop = transcript.current.scrollHeight
    }
  }, [messages, page])

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const message = body.trim()
    if (!message) { setError('Write a message before sending.'); return }
    setBusy(true)
    setError('')
    try {
      if (pendingMessage.current?.body !== message) {
        pendingMessage.current = { id: crypto.randomUUID(), body: message }
      }
      const { error } = await client.rpc('send_listing_message', {
        p_item_id: itemId, p_borrower_id: borrowerId, p_message_id: pendingMessage.current.id, p_body: message,
      })
      if (error) throw error
      pendingMessage.current = null
      setBody('')
      setPage(0)
      setRevision((value) => value + 1)
    } catch {
      setError('Couldn’t send your message. Try again.')
    } finally {
      setBusy(false)
    }
  }

  function refresh(pageNumber = page) {
    setMessages('loading')
    setPage(pageNumber)
    setRevision((value) => value + 1)
  }

  return (
    <section className="listing-chat" aria-label="Listing conversation">
      <div className="listing-transcript" ref={transcript} tabIndex={0} aria-label="Message history">
        <div className="listing-chat-heading">
          <button className="listing-refresh" type="button" onClick={() => refresh(0)}>Refresh messages</button>
        </div>
        {messages === 'loading' && <p className="student-muted" role="status">Loading messages…</p>}
        {messages === 'error' && <p className="form-error" role="alert">Couldn’t load messages. Try refreshing.</p>}
        {Array.isArray(messages) && <>
          {messages.length === 0 && <p className="student-muted">No messages yet.</p>}
          <ol className="listing-messages">
            {visibleMessages.map((message, index) => {
              const date = new Date(message.created_at)
              const day = date.toDateString()
              const previous = visibleMessages[index - 1]
              const mine = message.sender_id === studentId
              return <li key={message.id} className="listing-message-row">
                {(!previous || new Date(previous.created_at).toDateString() !== day) && <p className="listing-message-day">
                  {day === today ? 'Today' : date.toLocaleDateString(undefined, { dateStyle: 'medium' })}
                </p>}
                <div className={mine ? 'listing-message mine' : 'listing-message'}>
                  <p>{message.body}</p>
                  <small aria-label={mine ? 'Sent by you' : 'Received from your classmate'}>
                    <time dateTime={message.created_at}>{date.toLocaleTimeString(undefined, { timeStyle: 'short' })}</time>
                  </small>
                </div>
              </li>
            })}
          </ol>
          {(page > 0 || messages.length > messagePageSize) && <div className="student-actions">
            <button type="button" className="student-secondary" disabled={page === 0} onClick={() => refresh(page - 1)}>Newer</button>
            <button type="button" className="student-secondary" disabled={messages.length <= messagePageSize} onClick={() => refresh(page + 1)}>Older</button>
          </div>}
        </>}
      </div>
      <form className="listing-composer" onSubmit={send} aria-busy={busy}>
        <textarea aria-label="Your message" rows={1} maxLength={1000} required value={body} disabled={busy}
          onChange={(event) => setBody(event.target.value)} placeholder="Write a message…" />
        <button className="student-primary" type="submit" disabled={busy || !body.trim()} aria-label="Send message">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
            <path d="m3 11 18-8-7 18-3-8-8-2Zm8 2L21 3" />
          </svg>
        </button>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </section>
  )
}

export function ListingConversations({ client, studentId }: { client: SupabaseClient; studentId: string }) {
  const [result, setResult] = useState<Thread[] | 'loading' | 'error'>('loading')
  const [selected, setSelected] = useState<Thread | null>(null)
  const [showItem, setShowItem] = useState(false)
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [today] = useState(() => new Date().toDateString())

  useEffect(() => {
    let active = true
    async function load() {
      const start = page * threadPageSize
      try {
        const { data, error } = await client.rpc('list_listing_conversations', {
          p_offset: start, p_limit: threadPageSize,
        })
        if (!active) return
        setResult(error || !Array.isArray(data) ? 'error' : data as Thread[])
      } catch {
        if (active) setResult('error')
      }
    }
    void load()
    return () => { active = false }
  }, [client, page, revision])

  if (selected) {
    const name = selected.other_name ?? 'CIT student'
    const item = selected.item
    return <div className="student-panel listing-inbox-thread">
      <header className="listing-conversation-header">
        <button type="button" className="listing-back" aria-label="Back to messages" onClick={() => {
          setSelected(null)
          setPage(0)
          setRevision((value) => value + 1)
        }}>←</button>
        <span className="student-initial" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
        <div><h2>{name}</h2><p className="student-muted">Verified CIT student</p></div>
      </header>
      {item && <div className="listing-conversation-item">
        <div><h3>{item.name}</h3><p>{item.category} · {item.is_available ? 'Available to borrow' : 'Currently unavailable'}</p></div>
        <button className="student-secondary" type="button" aria-expanded={showItem}
          onClick={() => setShowItem(!showItem)}>{showItem ? 'Hide item' : 'View item'}</button>
        {showItem && <p className="listing-detail-description">{item.description || 'No description provided.'}</p>}
      </div>}
      <MessageThread client={client} studentId={studentId} itemId={selected.item_id} borrowerId={selected.borrower_id} />
    </div>
  }
  if (result === 'loading') return <p className="student-empty" role="status">Loading conversations…</p>
  if (result === 'error') return <div className="student-empty" role="alert">
    <p>Couldn’t load conversations.</p>
    <button type="button" className="student-secondary" onClick={() => setRevision(revision + 1)}>Try again</button>
  </div>

  const count = result[0]?.total_count ?? 0
  const more = (page + 1) * threadPageSize < count
  return (
    <>
      <section className="student-panel conversation-list" aria-label="Conversations">
        <h2>{count} {count === 1 ? 'conversation' : 'conversations'}</h2>
        {!result.length && <p className="conversation-empty">No conversations yet. Open a listing to message its owner.</p>}
        <ul>
          {result.map((thread) => {
            const name = thread.other_name ?? 'CIT student'
            const date = new Date(thread.activity_at)
            return <li key={thread.id}>
              <button type="button" className="conversation-row" onClick={() => { setShowItem(false); setSelected(thread) }}>
                <span className="student-initial" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
                <span className="conversation-row-copy">
                  <strong>{name}</strong>
                  <span className="conversation-item-name">{thread.item?.name ?? 'Listing conversation'}</span>
                  <span className="conversation-preview">{thread.last_message ?? 'No messages yet'}</span>
                </span>
                <time dateTime={thread.activity_at}>{date.toDateString() === today
                  ? date.toLocaleTimeString(undefined, { timeStyle: 'short' })
                  : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>
              </button>
            </li>
          })}
        </ul>
      </section>
      {(page > 0 || more) && <div className="student-actions student-pagination">
        <button type="button" className="student-secondary" disabled={page === 0} onClick={() => { setResult('loading'); setPage(page - 1) }}>Previous</button>
        <button type="button" className="student-secondary" disabled={!more} onClick={() => { setResult('loading'); setPage(page + 1) }}>Next</button>
      </div>}
    </>
  )
}
