import { AdminOnly } from '../../components/AdminOnly/AdminOnly'
import { DeleteButton } from '../../components/DeleteButton/DeleteButton'
import { EmptyState } from '../../components/EmptyState/EmptyState'
import { ErrorState } from '../../components/ErrorState/ErrorState'
import { Loading, SkeletonList, SkeletonTable } from '../../components/Skeleton'
import { Pagination } from '../../components/Pagination'
import { UpdateEmailsEditor } from '../../features/updates/UpdateEmailsEditor/UpdateEmailsEditor'
import { formatDate, formatDateTime } from '../../utils/formatDate'
import { useAnnouncementsViewModel, useDonationsViewModel, useSubscribersViewModel } from './CommunityPage.viewModel'

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
  const vm = useSubscribersViewModel()
  const { state } = vm

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
      {state.status === 'error' && <ErrorState message="Subscribers couldn't be loaded." onRetry={vm.retry} />}
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
                    <DeleteButton what={subscriber.email} onDelete={() => vm.deleteSubscriber(subscriber.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={vm.page} totalPages={vm.totalPages} onPageChange={vm.setPage} />
    </section>
  )
}

const STATUS_TEXT = { pending: 'Waiting for you', approved: 'To be sent', sent: 'Sent', ignored: 'Not sent' } as const

function Announcements() {
  const vm = useAnnouncementsViewModel()
  const { state } = vm

  return (
    <section className="card community-card" aria-labelledby="announcements-title">
      <h3 id="announcements-title">Update emails</h3>
      {state.status === 'loading' && (
        <Loading label="Loading the update emails…">
          <SkeletonList rows={3} pill />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message="The update emails couldn't be loaded." onRetry={vm.retry} />}
      {state.status === 'loaded' && state.data.totalCount === 0 && <EmptyState />}
      {vm.failed && <p role="alert">{vm.failed}</p>}
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
                  <button type="button" className="button button-small" onClick={() => vm.send(announcement.id)}>
                    Send email
                  </button>
                  <button type="button" className="button button-secondary button-small" onClick={() => vm.ignore(announcement.id)}>
                    Ignore
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={vm.page} totalPages={vm.totalPages} onPageChange={vm.setPage} />
    </section>
  )
}

function Donations() {
  const vm = useDonationsViewModel()
  const { state } = vm

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
      {state.status === 'error' && <ErrorState message="Coffees couldn't be loaded." onRetry={vm.retry} />}
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
      <Pagination page={vm.page} totalPages={vm.totalPages} onPageChange={vm.setPage} />
    </section>
  )
}
