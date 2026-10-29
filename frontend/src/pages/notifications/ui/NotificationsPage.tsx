import { useState } from 'react'
import { Link } from 'react-router'
import { AlertChannelsCard } from './AlertChannelsCard/AlertChannelsCard'
import { AdminOnly } from '@/entities/session'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { OnOffSwitch } from '@/shared/ui/OnOffSwitch'
import { Pagination } from '@/shared/ui/Pagination'
import { Loading, Skeleton, SkeletonList } from '@/shared/ui/Skeleton'
import type { AlertChannel, NotificationKind, NotificationStatus } from '@/shared/api'
import { useAppDispatch } from '@/shared/lib/store'
import { useListNotificationKindsQuery, useListNotificationsQuery, useSaveNotificationKindMutation } from '../api/notificationsApi'
import { baseApi } from '@/shared/api'
import { toLoadable } from '@/shared/api'
import { usePagedQuery } from '@/shared/api'
import { formatDateTime } from '@/shared/lib/format'
import { strings } from '@/shared/i18n'

const NOTIFICATIONS_PAGE_SIZE = 20

const SENT_TO: Record<AlertChannel, string> = { ntfy: 'ntfy', push: strings.notificationsPage.sitesNotifications }

const STATUS_TEXT: Record<NotificationStatus, string> = {
  sent: strings.notificationsPage.sent,
  off: strings.notificationsPage.offNotSent,
  'not-set-up': strings.notificationsPage.notSetUpNot,
  failed: strings.notificationsPage.failed,
  'no-channel': strings.notificationsPage.bothWaysOffNot,
}

/** A page on this site, to link the title to; null for anything else (only the API's own paths are links). */
const linkOf = (path: string | null) => (path?.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : null)

/**
 * Notifications (an admin-only tab): where alerts go (the ntfy app, the site's own notifications, each on or off, and
 * the devices that get the site's own), every kind of alert, each switched on or off, and the history of what was
 * raised, sent or not, and where. Visitors who open the URL go home.
 */
export function NotificationsPage() {
  return (
    <AdminOnly>
      <div className="notifications">
        <h2 className="visually-hidden">{strings.notificationsPage.notifications}</h2>
        <AlertChannelsCard />
        <Kinds />
        <History />
      </div>
    </AdminOnly>
  )
}

/** Every kind of phone alert, grouped as the API orders them, each with a switch. */
function Kinds() {
  const query = useListNotificationKindsQuery()
  const state = toLoadable(query)
  const [save] = useSaveNotificationKindMutation()
  const [failed, setFailed] = useState('')

  const kinds = state.status === 'loaded' ? state.data : []
  const groups: { name: string; kinds: NotificationKind[] }[] = []
  for (const kind of kinds) {
    const group = groups.at(-1)?.name === kind.group ? groups.at(-1)! : (groups.push({ name: kind.group, kinds: [] }), groups.at(-1)!)
    group.kinds.push(kind)
  }

  // The switch moves at once (pages/notifications/api/notificationsApi.ts), and is never locked while saving: locking it
  // would drop the keyboard's focus, and it can be clicked again before the first answer comes.
  async function toggle(kind: string, enabled: boolean) {
    setFailed('')
    try {
      await save({ kind, enabled }).unwrap()
    } catch {
      setFailed(strings.common.couldntSavedPleaseTry)
    }
  }

  return (
    <section className="card notifications-card" aria-labelledby="notification-kinds-title">
      <h3 id="notification-kinds-title">{strings.notificationsPage.phone}</h3>
      {state.status === 'loading' && (
        <Loading label={strings.notificationsPage.loadingNotifications}>
          {[52, 40, 46, 36, 44, 30].map((width, i) => (
            <div key={i} className="notification-kind">
              <Skeleton width={`${width}%`} height={16} />
              <Skeleton width={96} height={36} radius={999} />
            </div>
          ))}
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message={strings.notificationsPage.notificationsCouldntLoaded} onRetry={() => void query.refetch()} />}
      {failed && <p role="alert">{failed}</p>}
      {groups.map((group) => (
        <fieldset key={group.name} className="notification-group">
          <legend>{group.name}</legend>
          {group.kinds.map((kind) => (
            <div key={kind.kind} className="notification-kind">
              <span className="notification-kind-text">
                <span className="notification-kind-label">{kind.label}</span>
                <span className="muted notification-kind-meta">
                  {kind.lastAt ? strings.notificationsPage.n30DaysLast(kind.last30Days, formatDateTime(kind.lastAt)) : strings.notificationsPage.noneYet}
                </span>
              </span>
              <OnOffSwitch label={kind.label} on={kind.enabled} onChange={(on) => void toggle(kind.kind, on)} />
            </div>
          ))}
        </fieldset>
      ))}
    </section>
  )
}

/** What was raised, newest first, a page at a time, of every kind or the one picked. */
function History() {
  const [page, setPage] = useState(1)
  const [kind, setKind] = useState<string | null>(null)
  const dispatch = useAppDispatch()
  const { data: kinds = [] } = useListNotificationKindsQuery()
  const { state, totalPages, retry } = usePagedQuery(useListNotificationsQuery, { page, pageSize: NOTIFICATIONS_PAGE_SIZE, kind }, setPage)

  return (
    <section className="card notifications-card" aria-labelledby="notification-history-title">
      <div className="inbox-header">
        <h3 id="notification-history-title">{strings.notificationsPage.history}</h3>
        <span className="notification-history-actions">
          {state.status === 'loaded' && (
            <span className="muted">
              {state.data.totalCount} {strings.notificationsPage.all}
            </span>
          )}
          {/* What came while the page was open: the history, and the kinds' counts. */}
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => void dispatch(baseApi.util.invalidateTags([strings.notificationsPage.notifications, 'NotificationKinds']))}
          >
            {strings.notificationsPage.refresh}
          </button>
        </span>
      </div>
      <div className="field notification-filter">
        <label htmlFor="notification-kind">{strings.notificationsPage.kind}</label>
        <select
          id="notification-kind"
          className="select"
          value={kind ?? ''}
          onChange={(event) => {
            setKind(event.target.value || null)
            setPage(1)
          }}
        >
          <option value="">{strings.notificationsPage.everyKind}</option>
          {kinds.map((kind) => (
            <option key={kind.kind} value={kind.kind}>
              {kind.label}
            </option>
          ))}
        </select>
      </div>
      {state.status === 'loading' && (
        <Loading label={strings.notificationsPage.loadingHistory}>
          <SkeletonList rows={5} pill />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message={strings.notificationsPage.historyCouldntLoaded} onRetry={retry} />}
      {state.status === 'loaded' && state.data.totalCount === 0 && <EmptyState />}
      {state.status === 'loaded' && state.data.items.length > 0 && (
        <ul className="notification-list">
          {state.data.items.map((notification) => (
            <li key={notification.id} className="notification-item" data-status={notification.status}>
              <div className="notification-item-head">
                <span className="chip">{kinds.find((k) => k.kind === notification.kind)?.label ?? notification.kind}</span>
                <strong>{linkOf(notification.path) ? <Link to={linkOf(notification.path)!}>{notification.title}</Link> : notification.title}</strong>
                <span className={notification.status === 'sent' ? 'chip chip-muted' : 'chip notification-status-held'}>{STATUS_TEXT[notification.status]}</span>
                {notification.sentTo.length > 0 && (
                  <span className="muted notification-sent-to">
                    {strings.notificationsPage.to}
                    {notification.sentTo.map((c) => SENT_TO[c]).join(' and ')}
                  </span>
                )}
              </div>
              <p className="notification-message">{notification.message}</p>
              <time className="muted" dateTime={notification.createdAt}>
                {formatDateTime(notification.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </section>
  )
}
