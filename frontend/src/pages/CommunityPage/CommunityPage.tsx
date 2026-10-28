import { useState } from 'react'
import { AdminOnly } from '../../components/AdminOnly/AdminOnly'
import { DeleteButton } from '../../components/DeleteButton/DeleteButton'
import { EmptyState } from '../../components/EmptyState/EmptyState'
import { ErrorState } from '../../components/ErrorState/ErrorState'
import { Loading, SkeletonList, SkeletonTable } from '../../components/Skeleton'
import { Pagination } from '../../components/Pagination'
import { UpdateEmailsEditor } from '../../features/updates/UpdateEmailsEditor/UpdateEmailsEditor'
import { donationKind } from '../../services/api'
import { useDecideAnnouncementMutation, useDeleteSubscriberMutation, useListAnnouncementsQuery, useListDonationsQuery, useListSubscribersQuery } from '../../store/api/communityApi'
import { usePagedQuery, type PagedQueryHook, type PagedQueryOptions } from '../../store/usePagedQuery'
import { formatDate, formatDateTime } from '../../utils/formatDate'

const PAGE_SIZE = 20

/** While an update email is waiting to go out or going out: how often its count is asked again. */
export const SENDING_REFRESH_MS = 2000

/** One page of a list at a time, with its own page number (not in the URL: the tab holds several lists). */
function usePagedList<T>(useItems: PagedQueryHook<T>, options?: PagedQueryOptions) {
  const [page, setPage] = useState(1)
  return { page, setPage, ...usePagedQuery(useItems, { page, pageSize: PAGE_SIZE }, setPage, options) }
}

/**
 * The people around the site (an admin-only tab): who subscribed to email updates, the update emails
 * (new apps wait here to be sent or ignored), the words those emails say, and coffees from Buy Me a Coffee. Visitors who open the URL go home.
 */
export function CommunityPage() {
  return (
    <AdminOnly>
      <div className="community">
        <h2 className="visually-hidden">Community</h2>
        <Subscribers />
        <Announcements />
        <UpdateEmailsEditor />
        <Donations />
      </div>
    </AdminOnly>
  )
}

function Subscribers() {
  const { page, setPage, state, totalPages, retry } = usePagedList(useListSubscribersQuery)
  const [deleteSubscriber] = useDeleteSubscriberMutation()

  return (
    <section className="card community-card" aria-labelledby="subscribers-title">
      <div className="inbox-header">
        <h3 id="subscribers-title">Email subscribers</h3>
        {state.status === 'loaded' && <span className="muted">{state.data.totalCount} in all</span>}
      </div>
      {state.status === 'loading' && (
        <Loading label="Loading subscribers…">
          <SkeletonTable rows={4} columns={3} />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message="Subscribers couldn't be loaded." onRetry={retry} />}
      {state.status === 'loaded' && state.data.totalCount === 0 && <EmptyState />}
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
                    <DeleteButton what={subscriber.email} onDelete={() => deleteSubscriber(subscriber.id).unwrap()} />
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

const STATUS_TEXT = { pending: 'Waiting for you', approved: 'To be sent', sending: 'Sending…', sent: 'Sent', ignored: 'Not sent' } as const

function Announcements() {
  const [decide] = useDecideAnnouncementMutation()
  const [failed, setFailed] = useState('')

  async function decideOne(id: number, decision: 'send' | 'ignore') {
    setFailed('')
    try {
      await decide({ id, decision }).unwrap()
    } catch {
      setFailed("That didn't work. Please try again.")
    }
  }

  // An email on its way: asked again until it's sent, so its count is right without reloading the page.
  const [onItsWay, setOnItsWay] = useState(false)
  const { page, setPage, state, totalPages, retry } = usePagedList(useListAnnouncementsQuery, { pollingInterval: onItsWay ? SENDING_REFRESH_MS : 0 })
  const sending = state.status === 'loaded' && state.data.items.some((a) => a.status === 'approved' || a.status === 'sending')
  if (sending !== onItsWay) setOnItsWay(sending)

  return (
    <section className="card community-card" aria-labelledby="announcements-title">
      <h3 id="announcements-title">Update emails</h3>
      {state.status === 'loading' && (
        <Loading label="Loading the update emails…">
          <SkeletonList rows={3} pill />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message="The update emails couldn't be loaded." onRetry={retry} />}
      {state.status === 'loaded' && state.data.totalCount === 0 && <EmptyState />}
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
                  ? `${formatDateTime(announcement.sentAt)} · ${announcement.status === 'sending' ? `${announcement.recipientCount} sent so far` : `to ${announcement.recipientCount} ${announcement.recipientCount === 1 ? 'subscriber' : 'subscribers'}`}`
                  : formatDateTime(announcement.createdAt)}
              </span>
              {announcement.status === 'pending' && (
                <span className="community-actions">
                  <button type="button" className="button button-small" onClick={() => void decideOne(announcement.id, 'send')}>
                    Send email
                  </button>
                  <button type="button" className="button button-secondary button-small" onClick={() => void decideOne(announcement.id, 'ignore')}>
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
  const { page, setPage, state, totalPages, retry } = usePagedList(useListDonationsQuery)

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
      {state.status === 'error' && <ErrorState message="Coffees couldn't be loaded." onRetry={retry} />}
      {state.status === 'loaded' && state.data.totalCount === 0 && <EmptyState />}
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
                    {donationKind(donation.type) && <span className="muted"> · {donationKind(donation.type)}</span>}
                    {donation.isTest && <span className="chip chip-muted">Test</span>}
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
