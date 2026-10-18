import { useState } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth'
import { DeleteButton } from '../components/DeleteButton'
import { ErrorState } from '../components/ErrorState'
import { Loading, PageSkeleton, SkeletonList, SkeletonTable } from '../components/Skeleton'
import { Pagination } from '../components/Pagination'
import { usePagedList } from '../features/community/usePagedList'
import { api } from '../services/api'
import { formatDate, formatDateTime } from '../utils/formatDate'

const PAGE_SIZE = 20

// Stable references, so the lists load once per page.
const loadSubscribers = api.updates.listSubscribers
const loadAnnouncements = api.updates.listAnnouncements
const loadDonations = api.support.listDonations

/**
 * The people around the site (an admin-only tab): who subscribed to email updates, the update emails
 * (new apps wait here to be sent or ignored), and coffees from Buy Me a Coffee. Visitors who open the URL go home.
 */
export function CommunityPage() {
  const { status } = useAuth()

  if (status === 'loading') return <PageSkeleton />
  if (status === 'anonymous') return <Navigate to="/" replace />
  return (
    <div className="community">
      <h2 className="visually-hidden">Community</h2>
      <Subscribers />
      <Announcements />
      <Donations />
    </div>
  )
}

function Subscribers() {
  const { state, page, totalPages, setPage, reload } = usePagedList(loadSubscribers, PAGE_SIZE)

  return (
    <section className="card community-card" aria-labelledby="subscribers-title">
      <div className="inbox-header">
        <h3 id="subscribers-title">Email subscribers</h3>
        {state.status === 'loaded' && <span className="muted">{state.data.totalCount} in all</span>}
      </div>
      <p className="muted">They get an email about each new app you choose to send, and each new YouTube video. Only confirmed addresses get them.</p>
      {state.status === 'loading' && (
        <Loading label="Loading subscribers…">
          <SkeletonTable rows={4} columns={3} />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message="Subscribers couldn't be loaded." onRetry={reload} />}
      {state.status === 'loaded' && state.data.totalCount === 0 && <p className="muted">No subscribers yet.</p>}
      {state.status === 'loaded' && state.data.items.length > 0 && (
        <div className="table-scroll" role="region" aria-label="Subscribers table" tabIndex={0}>
          <table className="messages-table">
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Status</th>
                <th scope="col">Since</th>
                <th scope="col" className="col-actions">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.data.items.map((subscriber) => (
                <tr key={subscriber.id}>
                  <td>{subscriber.email}</td>
                  <td>{subscriber.confirmedAt ? <span className="chip">Confirmed</span> : <span className="chip chip-muted">Waiting for confirmation</span>}</td>
                  <td>
                    <time dateTime={subscriber.createdAt}>{formatDate(subscriber.createdAt)}</time>
                  </td>
                  <td className="col-actions">
                    <DeleteButton
                      what={subscriber.email}
                      onDelete={async () => {
                        await api.updates.deleteSubscriber(subscriber.id)
                        reload()
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </section>
  )
}

const STATUS_TEXT = { pending: 'Waiting for you', approved: 'Sending…', sent: 'Sent', ignored: 'Not sent' } as const

function Announcements() {
  const { state, page, totalPages, setPage, reload } = usePagedList(loadAnnouncements, PAGE_SIZE)
  const [failed, setFailed] = useState('')

  async function decide(id: number, decision: 'send' | 'ignore') {
    setFailed('')
    try {
      await api.updates.decide(id, decision)
      reload()
    } catch {
      setFailed("That didn't work. Please try again.")
    }
  }

  return (
    <section className="card community-card" aria-labelledby="announcements-title">
      <h3 id="announcements-title">Update emails</h3>
      <p className="muted">A new app waits for you: send or ignore it here, or from the alert on your phone. New videos are emailed by themselves.</p>
      {state.status === 'loading' && (
        <Loading label="Loading the update emails…">
          <SkeletonList rows={3} pill />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message="The update emails couldn't be loaded." onRetry={reload} />}
      {state.status === 'loaded' && state.data.totalCount === 0 && <p className="muted">Nothing yet. The next new app or video shows up here.</p>}
      {failed && <p role="alert">{failed}</p>}
      {state.status === 'loaded' && state.data.items.length > 0 && (
        <ul className="community-list">
          {state.data.items.map((announcement) => (
            <li key={announcement.id}>
              <span className="chip">{announcement.kind === 'video' ? 'Video' : 'App'}</span>
              <strong>{announcement.title}</strong>
              <span className={announcement.status === 'pending' ? 'chip' : 'chip chip-muted'}>{STATUS_TEXT[announcement.status]}</span>
              <span className="muted">
                {announcement.sentAt
                  ? `${formatDateTime(announcement.sentAt)} · to ${announcement.recipientCount} ${announcement.recipientCount === 1 ? 'subscriber' : 'subscribers'}`
                  : formatDateTime(announcement.createdAt)}
              </span>
              {announcement.status === 'pending' && (
                <span className="community-actions">
                  <button type="button" className="button button-small" onClick={() => void decide(announcement.id, 'send')}>
                    Send email
                  </button>
                  <button type="button" className="button button-secondary button-small" onClick={() => void decide(announcement.id, 'ignore')}>
                    Ignore
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </section>
  )
}

function Donations() {
  const { state, page, totalPages, setPage, reload } = usePagedList(loadDonations, PAGE_SIZE)

  return (
    <section className="card community-card" aria-labelledby="donations-title">
      <div className="inbox-header">
        <h3 id="donations-title">Coffees (Buy Me a Coffee)</h3>
        {state.status === 'loaded' && <span className="muted">{state.data.totalCount} in all</span>}
      </div>
      {state.status === 'loading' && (
        <Loading label="Loading coffees…">
          <SkeletonTable rows={3} columns={4} />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message="Coffees couldn't be loaded." onRetry={reload} />}
      {state.status === 'loaded' && state.data.totalCount === 0 && <p className="muted">No coffees yet. They appear here once the Buy Me a Coffee webhook is set up (Settings).</p>}
      {state.status === 'loaded' && state.data.items.length > 0 && (
        <div className="table-scroll" role="region" aria-label="Donations table" tabIndex={0}>
          <table className="messages-table">
            <thead>
              <tr>
                <th scope="col">From</th>
                <th scope="col">Amount</th>
                <th scope="col">Message</th>
                <th scope="col">Received</th>
              </tr>
            </thead>
            <tbody>
              {state.data.items.map((donation) => (
                <tr key={donation.id}>
                  <td>
                    {donation.email ? <a href={`mailto:${donation.email}`}>{donation.fromName}</a> : donation.fromName}
                    {!donation.type.startsWith('donation') && <span className="muted"> · {donation.type}</span>}
                  </td>
                  <td>
                    {donation.amount} {donation.currency}
                  </td>
                  <td>{donation.message ?? <span className="muted">No message</span>}</td>
                  <td>
                    <time dateTime={donation.receivedAt}>{formatDateTime(donation.receivedAt)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </section>
  )
}
