import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Field, SubmitButton } from './AuthFields'
import { MessageThread } from './ListingMessages'

type Listing = {
  id: string; owner_id: string; name: string; description: string
  category: string; image_path: string | null; created_at: string; imageUrl?: string
  is_available: boolean
}
type ListingResult = { items: Listing[]; more: boolean } | 'loading' | 'error'
const pageSize = 12
const categories = ['Electronics', 'Books & Notes', 'School Supplies', 'Tools & Equipment', 'Sports & Recreation', 'Other']
const pictureBucket = 'listing-pictures'
const pictureTypes = ['image/jpeg', 'image/png', 'image/webp']

function useListings(client: SupabaseClient, search: string, category: string, page: number, limit: number, retry: number, ownerId?: string) {
  const [result, setResult] = useState<ListingResult>('loading')

  useEffect(() => {
    let active = true
    async function load() {
      setResult('loading')
      const start = page * limit
      let query = client.from('items').select('id, owner_id, name, description, category, image_path, created_at, is_available')
        .is('archived_at', null).order('created_at', { ascending: false }).order('id')
        .range(start, start + limit)
      query = ownerId ? query.eq('owner_id', ownerId) : query.eq('is_available', true)
      if (search) query = query.ilike('name', '%' + search.replace(/[\\%_]/g, '\\$&') + '%')
      if (category) query = query.eq('category', category)
      try {
        const { data, error } = await query.overrideTypes<Listing[], { merge: false }>()
        if (!active) return
        if (error || !data) {
          setResult('error')
          return
        }
        const items = data.slice(0, limit)
        const more = data.length > limit
        setResult({ items, more })
        const paths = items.flatMap((item) => item.image_path ? [item.image_path] : [])
        if (!paths.length) return
        const signed = await client.storage.from(pictureBucket).createSignedUrls(paths, 3600).catch(() => null)
        const images = signed?.data
        if (!active || !images) return
        const urls = new Map(images.map((image) => [image.path, image.signedUrl]))
        setResult({ items: items.map((item) => ({
          ...item, imageUrl: item.image_path ? urls.get(item.image_path) ?? undefined : undefined,
        })), more })
      } catch {
        if (active) setResult('error')
      }
    }
    void load()
    return () => { active = false }
  }, [client, search, category, page, limit, retry, ownerId])

  return result
}

function ListingPicture({ url, name }: { url?: string; name: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="listing-photo">
      {url && !failed ? <img src={url} alt={name} loading="lazy" onError={() => setFailed(true)} />
        : <div className="listing-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z M3 7.5l9 4.5 9-4.5 M12 12v9" />
          </svg>
        </div>}
    </div>
  )
}

function ItemDetails({ item, client, studentId, request, onClose }: {
  item: Listing; client: SupabaseClient; studentId: string; request: ReactNode; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [owner, setOwner] = useState('')
  const [chat, setChat] = useState(false)
  const isOwner = item.owner_id === studentId

  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => {
    let active = true
    async function loadOwner() {
      const { data } = await client.rpc('get_profile_name', { p_profile_id: item.owner_id })
      if (active && typeof data === 'string') setOwner(data)
    }
    void loadOwner().catch(() => {})
    return () => { active = false }
  }, [client, item.owner_id])

  return (
    <dialog ref={dialog} className="listing-dialog" aria-labelledby="listing-detail-title" onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close() }}>
      <div className="listing-dialog-inner">
        <button className="listing-dialog-close" type="button" aria-label="Close item details"
          onClick={() => dialog.current?.close()}>×</button>
        <ListingPicture key={item.imageUrl} url={item.imageUrl} name={item.name} />
        <div className="listing-detail">
          <div className="listing-tags">
            <span className="student-pill">{item.category}</span>
            <span className="student-pill" data-status={item.is_available ? 'available' : 'pending'}>
              {item.is_available ? 'Available to borrow' : 'On loan'}
            </span>
          </div>
          <h2 id="listing-detail-title">{item.name}</h2>
          <p className="listing-detail-description">{item.description || 'No description provided.'}</p>
          <p className="student-muted">Listed <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString()}</time></p>
          <div className="listing-detail-owner">
            <span className="student-initial" aria-hidden="true">{owner.charAt(0).toUpperCase() || 'C'}</span>
            <div><strong>{isOwner ? 'Your listing' : owner || 'CIT student'}</strong><p className="student-muted">Verified CIT student</p></div>
          </div>
          {!isOwner && <div className="student-actions listing-detail-actions">
            {request}
            <button className="student-secondary" type="button" aria-expanded={chat}
              onClick={() => setChat(!chat)}>{chat ? 'Hide conversation' : 'Send a message'}</button>
          </div>}
          {chat && <MessageThread client={client} studentId={studentId} itemId={item.id} borrowerId={studentId} />}
        </div>
      </div>
    </dialog>
  )
}

function ListingGrid({ client, studentId, result, empty, quickRequest = false, onRetry, manage }: {
  client: SupabaseClient; studentId: string; result: ListingResult; empty: string; quickRequest?: boolean; onRetry: () => void
  manage?: (item: Listing) => ReactNode
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [requested, setRequested] = useState<string[]>([])
  const [failed, setFailed] = useState<string | null>(null)

  async function requestItem(item: Listing) {
    if (busy) return
    setBusy(item.id)
    setFailed(null)
    try {
      const { error } = await client.rpc('request_item', { p_item_id: item.id })
      if (error) throw error
      setRequested((ids) => [...ids, item.id])
    } catch {
      setFailed(item.id)
    } finally {
      setBusy(null)
    }
  }

  function requestAction(item: Listing, primary = false) {
    if (item.owner_id === studentId) return <small className="listing-owner">Your listing</small>
    if (requested.includes(item.id)) return <a className="student-secondary" href="/inbox">Request sent · View requests</a>
    return <>
      <button className={primary ? 'student-primary' : 'student-secondary'} disabled={busy !== null}
        type="button" onClick={() => void requestItem(item)}>
        {busy === item.id ? 'Sending…' : 'Request to borrow'}
      </button>
      {failed === item.id && <p className="form-error" role="alert">Couldn’t request this item. It may no longer be available.</p>}
    </>
  }

  if (result === 'loading') return <p className="student-empty" role="status">Loading listings…</p>
  if (result === 'error') return <div className="student-empty" role="alert">
    <p>Couldn’t load listings.</p><button className="student-secondary" onClick={onRetry}>Try again</button>
  </div>
  if (!result.items.length) return <p className="student-empty">{empty}</p>
  const item = result.items.find((item) => item.id === selected)

  return (
    <div className="student-listings">
      {result.items.map((item) => (
        <article className="student-panel listing-card" key={item.id}>
          <button className="listing-photo-button" type="button" aria-label={'View details for ' + item.name}
            aria-haspopup="dialog" onClick={() => setSelected(item.id)}>
            <ListingPicture key={item.imageUrl} url={item.imageUrl} name={item.name} />
          </button>
          <div className="listing-card-content">
            <div className="listing-tags">
              <span className="student-pill" data-status={item.is_available ? 'available' : 'pending'}>
                {item.is_available ? 'Available' : 'On loan'}
              </span>
              <span className="student-pill">{item.category}</span>
            </div>
            <h3>{item.name}</h3>
            <p>{item.description || 'No description provided.'}</p>
            {quickRequest && requestAction(item)}
            {manage?.(item)}
          </div>
        </article>
      ))}
      {item && <ItemDetails key={item.id} item={item} client={client} studentId={studentId}
        request={requestAction(item, true)} onClose={() => setSelected(null)} />}
    </div>
  )
}

export function Home({ client, firstName, studentId }: { client: SupabaseClient; firstName: string; studentId: string }) {
  const [retry, setRetry] = useState(0)
  const result = useListings(client, '', '', 0, 3, retry)
  return (
    <>
      <section className="student-hero">
        <div className="student-hero-copy">
          <p className="student-eyebrow">CIT Campus Exchange</p>
          <h1>Welcome, {firstName}.</h1>
          <p>Borrow what you need from fellow CIT students, or share something of your own.</p>
          <div className="student-actions">
            <a className="student-primary" href="/browse">Browse items <span aria-hidden="true">↗</span></a>
            <a className="student-secondary" href="/post">Post an item</a>
            <a className="student-secondary" href="/my-listings">My listings</a>
          </div>
        </div>
        <div className="student-hero-art" aria-hidden="true">
          <span>BB / CIT</span><strong>↔</strong><span>CAMPUS EXCHANGE</span>
        </div>
      </section>
      <section aria-labelledby="recent-title">
        <div className="student-section-heading">
          <div><p className="student-eyebrow">Around campus</p><h2 id="recent-title">Recently listed</h2></div>
          <a href="/browse">Browse all <span aria-hidden="true">→</span></a>
        </div>
        <ListingGrid client={client} studentId={studentId} result={result}
          empty="No available items yet. Post an item to get started." onRetry={() => setRetry(retry + 1)} />
      </section>
    </>
  )
}

export function Browse({ client, studentId }: { client: SupabaseClient; studentId: string }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(0)
  const [retry, setRetry] = useState(0)
  const result = useListings(client, search, category, page, pageSize, retry)

  return (
    <>
      <div className="student-page-heading">
        <p className="student-eyebrow">Campus listings</p>
        <h1>Browse items</h1>
        <p>Find available items and send a request to borrow them.</p>
      </div>
      <form className="student-search" role="search" onSubmit={(event) => {
        event.preventDefault()
        setPage(0)
        setSearch(String(new FormData(event.currentTarget).get('search') ?? '').trim())
      }}>
        <label htmlFor="item-search">Search by item name</label>
        <input id="item-search" name="search" type="search" placeholder="Try “calculator”" maxLength={120} />
        <button className="student-primary" type="submit">Search</button>
      </form>
      <div className="listing-filters" role="group" aria-label="Filter by category">
        {['', ...categories].map((option) => (
          <button key={option} type="button" className="student-secondary" aria-pressed={category === option}
            onClick={() => { setCategory(option); setPage(0) }}>{option || 'All categories'}</button>
        ))}
      </div>
      <ListingGrid client={client} studentId={studentId} result={result} quickRequest
        empty={search || category ? 'No available items match your filters.' : 'No available items yet.'}
        onRetry={() => setRetry(retry + 1)} />
      {typeof result === 'object' && (page > 0 || result.more) && <div className="student-actions student-pagination">
        <button className="student-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page + 1}</span>
        <button className="student-secondary" disabled={!result.more} onClick={() => setPage(page + 1)}>Next</button>
      </div>}
    </>
  )
}

function ListingFields({ item, children }: { item?: Listing; children?: ReactNode }) {
  return <>
    <Field label="Item name" name="name" maxLength={120} placeholder="e.g. Scientific calculator" defaultValue={item?.name} required />
    <div className="field">
      <label htmlFor="listing-category">Category</label>
      <select id="listing-category" name="category" defaultValue={item?.category ?? ''} required>
        <option value="" disabled>Choose a category</option>
        {categories.map((option) => <option key={option}>{option}</option>)}
      </select>
    </div>
    {children}
    <div className="field">
      <label htmlFor="description">Description <span className="student-muted">(optional)</span></label>
      <textarea id="description" name="description" rows={5} maxLength={2000} defaultValue={item?.description}
        placeholder="Add details about the item and its condition." />
    </div>
  </>
}

export function MyListings({ client, studentId }: { client: SupabaseClient; studentId: string }) {
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState<Listing | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const result = useListings(client, '', '', page, pageSize, revision, studentId)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || busy) return
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const category = String(form.get('category') ?? '')
    const description = String(form.get('description') ?? '').trim()
    if (!name || !categories.includes(category)) {
      setError('Enter an item name and choose a category.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { error } = await client.from('items').update({ name, description, category })
        .eq('id', editing.id).eq('owner_id', studentId).is('archived_at', null).select('id').single()
      if (error) throw error
      setEditing(null)
      setMessage('Listing updated.')
      setRevision((value) => value + 1)
    } catch {
      setError('Couldn’t save changes. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(item: Listing) {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { error } = await client.rpc('archive_listing', { p_item_id: item.id })
      if (error) {
        setError(error.message === 'Mark the item returned before removing the listing.'
          ? error.message : 'Couldn’t remove this listing. Try again.')
        return
      }
      setRemoving(null)
      setMessage('Listing removed from Browse.')
      if (typeof result === 'object' && result.items.length === 1 && page > 0) setPage(page - 1)
      setRevision((value) => value + 1)
    } catch {
      setError('Couldn’t remove this listing. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return <>
    <div className="student-page-heading">
      <p className="student-eyebrow">Lender tools</p>
      <h1>My listings</h1>
      <p>Manage the items you’ve posted and review incoming borrow requests.</p>
      <div className="student-actions lender-links">
        <a className="student-primary" href="/post">Add listing</a>
        <a className="student-secondary" href="/inbox">Review borrow requests</a>
      </div>
    </div>
    {error && !editing && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="student-feedback" role="status">{message}</p>}
    {editing ? <section className="student-panel student-form-panel">
      <h2>Edit listing</h2>
      <form className="auth-form lender-links" onSubmit={save} aria-busy={busy}>
        <ListingFields item={editing} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <SubmitButton busy={busy}>{busy ? 'Saving…' : 'Save changes'}</SubmitButton>
        <button className="student-secondary" type="button" disabled={busy}
          onClick={() => { setEditing(null); setError('') }}>Cancel edit</button>
      </form>
    </section> : <>
      <ListingGrid client={client} studentId={studentId} result={result}
        empty="You haven’t posted any listings yet." onRetry={() => setRevision(revision + 1)}
        manage={(item) => removing === item.id ? <>
          <p>Remove this listing from Browse? Pending requests will be declined.</p>
          <div className="student-actions">
            <button type="button" className="student-primary" disabled={busy} onClick={() => void remove(item)}>Confirm removal</button>
            <button type="button" className="student-secondary" disabled={busy} onClick={() => setRemoving(null)}>Keep listing</button>
          </div>
        </> : <>
          <div className="student-actions">
            <button type="button" className="student-secondary" disabled={busy} onClick={() => {
              setEditing(item); setRemoving(null); setError(''); setMessage('')
            }}>Edit</button>
            <button type="button" className="student-secondary" disabled={busy || !item.is_available}
              onClick={() => { setRemoving(item.id); setError(''); setMessage('') }}>Remove</button>
          </div>
          {!item.is_available && <small className="student-muted">Mark the item returned before removing it.</small>}
        </>} />
      {typeof result === 'object' && (page > 0 || result.more) && <div className="student-actions student-pagination">
        <button type="button" className="student-secondary" disabled={busy || page === 0}
          onClick={() => { setRemoving(null); setPage(page - 1) }}>Previous</button>
        <span>Page {page + 1}</span>
        <button type="button" className="student-secondary" disabled={busy || !result.more}
          onClick={() => { setRemoving(null); setPage(page + 1) }}>Next</button>
      </div>}
    </>}
  </>
}

export function Post({ client, studentId }: { client: SupabaseClient; studentId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [posted, setPosted] = useState(false)
  const pendingId = useRef<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const fields = new FormData(event.currentTarget)
    const name = String(fields.get('name') ?? '').trim()
    const description = String(fields.get('description') ?? '').trim()
    const category = String(fields.get('category') ?? '')
    const file = fields.get('photo')
    const photo = file instanceof File && file.size > 0 ? file : null
    if (!name) { setError('Enter an item name.'); return }
    if (!categories.includes(category)) { setError('Choose a category.'); return }
    if (photo && (!pictureTypes.includes(photo.type) || photo.size > 5 * 1024 * 1024)) {
      setError('Choose a JPEG, PNG, or WebP image up to 5 MB.')
      return
    }

    const retrying = pendingId.current !== null
    const id = pendingId.current ?? crypto.randomUUID()
    pendingId.current = id
    const imagePath = photo ? studentId + '/' + id : null
    setBusy(true)
    setError('')
    try {
      if (retrying) {
        const { data, error } = await client.from('items').select('id').eq('id', id).eq('owner_id', studentId).maybeSingle()
        if (error) throw error
        if (data) {
          pendingId.current = null
          setPosted(true)
          return
        }
      }
      if (photo && imagePath) {
        const { error } = await client.storage.from(pictureBucket).upload(imagePath, photo, {
          upsert: true, contentType: photo.type,
        })
        if (error) {
          setError('Couldn’t upload your photo. Try again.')
          return
        }
      }
      const { error } = await client.from('items').insert({ id, name, description, category, image_path: imagePath })
      if (error) throw error
      pendingId.current = null
      setPosted(true)
    } catch {
      setError('Couldn’t publish your listing. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="student-page-heading">
        <p className="student-eyebrow">Share with campus</p>
        <h1>Post an item</h1>
        <p>List something you’re willing to lend to another CIT student.</p>
        <div className="student-actions lender-links">
          <a className="student-secondary" href="/my-listings">My listings</a>
          <a className="student-secondary" href="/inbox">Review borrow requests</a>
        </div>
      </div>
      <section className="student-panel student-form-panel">
        {posted ? <>
          <h2 role="status">Your item is listed.</h2>
          <p className="student-muted">Students can now find it in Browse and send you a borrow request.</p>
          <div className="student-actions">
            <a href="/my-listings" className="student-primary">View my listings</a>
            <button type="button" className="student-secondary" onClick={() => setPosted(false)}>Post another item</button>
          </div>
        </> : <form className="auth-form" onSubmit={submit} aria-busy={busy}>
          <ListingFields>
            <div className="field">
              <label htmlFor="listing-photo">Item photo <span className="student-muted">(optional)</span></label>
              <input id="listing-photo" name="photo" type="file" accept={pictureTypes.join(',')} aria-describedby="listing-photo-help" />
              <small id="listing-photo-help" className="student-muted">JPEG, PNG, or WebP up to 5 MB.</small>
            </div>
          </ListingFields>
          {error && <p className="form-error" role="alert">{error}</p>}
          <SubmitButton busy={busy}>{busy ? 'Publishing…' : 'Publish listing'}</SubmitButton>
        </form>}
      </section>
    </>
  )
}
