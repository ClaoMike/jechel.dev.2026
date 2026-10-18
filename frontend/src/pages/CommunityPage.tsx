import { Navigate } from 'react-router'
import { useAuth } from '../auth'
import { DeleteButton } from '../components/DeleteButton'
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
 * The people around the site (an admin-only tab): who subscribed to email updates, what was emailed
 * to them, and donations from "Buy me a coffee" (Ko-fi). Visitors who open the URL go home.
 */
export function CommunityPage() {
  const { status } = useAuth()

  if (status === 'loading') return <p>Loading…</p>
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
      <p className="muted">They get an email when a new app (30 minutes after it's added) or YouTube video is posted. Only confirmed addresses get them.</p>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">Subscribers couldn't be loaded.</p>}
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

function Announcements() {
  const { state, page, totalPages, setPage } = usePagedList(loadAnnouncements, PAGE_SIZE)

  return (
    <section className="card community-card" aria-labelledby="announcements-title">
      <h3 id="announcements-title">Emails sent</h3>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">The sent emails couldn't be loaded.</p>}
      {state.status === 'loaded' && state.data.totalCount === 0 && <p className="muted">Nothing sent yet. The next new app or video will be.</p>}
      {state.status === 'loaded' && state.data.items.length > 0 && (
        <ul className="community-list">
          {state.data.items.map((announcement) => (
            <li key={announcement.id}>
              <span className="chip">{announcement.kind === 'video' ? 'Video' : 'App'}</span>
              <strong>{announcement.title}</strong>
              <span className="muted">
                {formatDateTime(announcement.sentAt)} · to {announcement.recipientCount} {announcement.recipientCount === 1 ? 'subscriber' : 'subscribers'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </section>
  )
}

function Donations() {
  const { state, page, totalPages, setPage } = usePagedList(loadDonations, PAGE_SIZE)

  return (
    <section className="card community-card" aria-labelledby="donations-title">
      <div className="inbox-header">
        <h3 id="donations-title">Coffees (donations)</h3>
        {state.status === 'loaded' && <span className="muted">{state.data.totalCount} in all</span>}
      </div>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">Donations couldn't be loaded.</p>}
      {state.status === 'loaded' && state.data.totalCount === 0 && <p className="muted">No donations yet. They appear here once Ko-fi's webhook is set up.</p>}
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
                    {donation.type !== 'Donation' && <span className="muted"> · {donation.type}</span>}
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
