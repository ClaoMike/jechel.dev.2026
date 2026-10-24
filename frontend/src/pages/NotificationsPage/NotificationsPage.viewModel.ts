import { useState } from 'react'
import type { AlertChannel, NotificationKind, NotificationStatus } from '../../services/api'
import { useAppDispatch } from '../../store'
import { baseApi } from '../../store/baseApi'
import { useListNotificationKindsQuery, useListNotificationsQuery, useSaveNotificationKindMutation } from '../../store/api/notificationsApi'
import { toLoadable } from '../../store/loadable'
import { usePagedQuery } from '../../store/usePagedQuery'

export const NOTIFICATIONS_PAGE_SIZE = 20

const SENT_TO: Record<AlertChannel, string> = { ntfy: 'ntfy', push: "this site's notifications" }

export const STATUS_TEXT: Record<NotificationStatus, string> = {
  sent: 'Sent',
  off: 'Off: not sent',
  'not-set-up': 'Not set up: not sent',
  failed: 'Failed',
  'no-channel': 'Both ways off: not sent',
}

/** Every kind of phone alert, grouped as the API orders them, each with a switch. */
export function useNotificationKindsViewModel() {
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

  // The switch moves at once (store/api/notificationsApi.ts), and is never locked while saving: locking it
  // would drop the keyboard's focus, and it can be clicked again before the first answer comes.
  async function toggle(kind: string, enabled: boolean) {
    setFailed('')
    try {
      await save({ kind, enabled }).unwrap()
    } catch {
      setFailed("That couldn't be saved. Please try again.")
    }
  }

  return { state, retry: () => void query.refetch(), groups, failed, toggle: (kind: string, enabled: boolean) => void toggle(kind, enabled) }
}

/** What was raised, newest first, a page at a time, of every kind or the one picked. */
export function useNotificationHistoryViewModel() {
  const [page, setPage] = useState(1)
  const [kind, setKind] = useState<string | null>(null)
  const dispatch = useAppDispatch()
  const { data: kinds = [] } = useListNotificationKindsQuery()
  const paged = usePagedQuery(useListNotificationsQuery, { page, pageSize: NOTIFICATIONS_PAGE_SIZE, kind }, setPage)

  return {
    ...paged,
    page,
    setPage,
    kind,
    kinds,
    labelOf: (key: string) => kinds.find((k) => k.kind === key)?.label ?? key,
    /** Where it went, e.g. "to ntfy and this site's notifications". */
    sentToText: (channels: AlertChannel[]) => `to ${channels.map((c) => SENT_TO[c]).join(' and ')}`,
    /** A page on this site, to link the title to; null for anything else (only the API's own paths are links). */
    linkOf: (path: string | null) => (path?.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : null),
    /** What came while the page was open: the history, and the kinds' counts. */
    refresh: () => void dispatch(baseApi.util.invalidateTags(['Notifications', 'NotificationKinds'])),
    chooseKind: (next: string) => {
      setKind(next || null)
      setPage(1)
    },
  }
}
