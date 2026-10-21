import { Link } from 'react-router'
import { AdminOnly } from '../../components/AdminOnly/AdminOnly'
import { EmptyState } from '../../components/EmptyState/EmptyState'
import { ErrorState } from '../../components/ErrorState/ErrorState'
import { OnOffSwitch } from '../../components/OnOffSwitch/OnOffSwitch'
import { Pagination } from '../../components/Pagination'
import { Loading, Skeleton, SkeletonList } from '../../components/Skeleton'
import { formatDateTime } from '../../utils/formatDate'
import { STATUS_TEXT, useNotificationHistoryViewModel, useNotificationKindsViewModel } from './NotificationsPage.viewModel'

/**
 * Notifications (an admin-only tab): every kind of alert the site sends to the phone, each switched on or
 * off, and the history of what was raised, sent or not. Visitors who open the URL go home.
 */
export function NotificationsPage() {
  return (
    <AdminOnly>
      <div className="notifications">
        <h2 className="visually-hidden">Notifications</h2>
        <Kinds />
        <History />
      </div>
    </AdminOnly>
  )
}

function Kinds() {
  const vm = useNotificationKindsViewModel()
  const { state } = vm

  return (
    <section className="card notifications-card" aria-labelledby="notification-kinds-title">
      <h3 id="notification-kinds-title">On your phone</h3>
      {state.status === 'loading' && (
        <Loading label="Loading the notifications…">
          {[52, 40, 46, 36, 44, 30].map((width, i) => (
            <div key={i} className="notification-kind">
              <Skeleton width={`${width}%`} height={16} />
              <Skeleton width={96} height={36} radius={999} />
            </div>
          ))}
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message="The notifications couldn't be loaded." onRetry={vm.retry} />}
      {vm.failed && <p role="alert">{vm.failed}</p>}
      {vm.groups.map((group) => (
        <fieldset key={group.name} className="notification-group">
          <legend>{group.name}</legend>
          {group.kinds.map((kind) => (
            <div key={kind.kind} className="notification-kind">
              <span className="notification-kind-text">
                <span className="notification-kind-label">{kind.label}</span>
                <span className="muted notification-kind-meta">{kind.lastAt ? `${kind.last30Days} in 30 days · last ${formatDateTime(kind.lastAt)}` : 'None yet'}</span>
              </span>
              <OnOffSwitch label={kind.label} on={kind.enabled} disabled={vm.saving === kind.kind} onChange={(on) => vm.toggle(kind.kind, on)} />
            </div>
          ))}
        </fieldset>
      ))}
    </section>
  )
}

function History() {
  const vm = useNotificationHistoryViewModel()
  const { state } = vm

  return (
    <section className="card notifications-card" aria-labelledby="notification-history-title">
      <div className="inbox-header">
        <h3 id="notification-history-title">History</h3>
        {state.status === 'loaded' && <span className="muted">{state.data.totalCount} in all</span>}
      </div>
      <div className="field notification-filter">
        <label htmlFor="notification-kind">Kind</label>
        <select id="notification-kind" className="select" value={vm.kind ?? ''} onChange={(event) => vm.chooseKind(event.target.value)}>
          <option value="">Every kind</option>
          {vm.kinds.map((kind) => (
            <option key={kind.kind} value={kind.kind}>
              {kind.label}
            </option>
          ))}
        </select>
      </div>
      {state.status === 'loading' && (
        <Loading label="Loading the history…">
          <SkeletonList rows={5} pill />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message="The history couldn't be loaded." onRetry={vm.retry} />}
      {state.status === 'loaded' && state.data.totalCount === 0 && <EmptyState />}
      {state.status === 'loaded' && state.data.items.length > 0 && (
        <ul className="notification-list">
          {state.data.items.map((notification) => (
            <li key={notification.id} className="notification-item" data-status={notification.status}>
              <div className="notification-item-head">
                <span className="chip">{vm.labelOf(notification.kind)}</span>
                <strong>{notification.path ? <Link to={notification.path}>{notification.title}</Link> : notification.title}</strong>
                <span className={notification.status === 'sent' ? 'chip chip-muted' : 'chip notification-status-held'}>{STATUS_TEXT[notification.status]}</span>
              </div>
              <p className="notification-message">{notification.message}</p>
              <time className="muted" dateTime={notification.createdAt}>
                {formatDateTime(notification.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={vm.page} totalPages={vm.totalPages} onPageChange={vm.setPage} />
    </section>
  )
}
