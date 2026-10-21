import { useState } from 'react'
import type { NotificationKind, NotificationStatus } from '../../services/api'
import { useListNotificationKindsQuery, useListNotificationsQuery, useSaveNotificationKindMutation } from '../../store/api/notificationsApi'
import { toLoadable } from '../../store/loadable'
import { usePagedQuery } from '../../store/usePagedQuery'

export const NOTIFICATIONS_PAGE_SIZE = 20

export const STATUS_TEXT: Record<NotificationStatus, string> = { sent: 'Sent', off: 'Off: not sent', 'not-set-up': 'ntfy not set up', failed: 'Failed' }

/** Every kind of phone alert, grouped as the API orders them, each with a switch. */
export function useNotificationKindsViewModel() {
  const query = useListNotificationKindsQuery()
  const state = toLoadable(query)
  const [save] = useSaveNotificationKindMutation()
  const [saving, setSaving] = useState<string | null>(null)
  const [failed, setFailed] = useState('')

  const kinds = state.status === 'loaded' ? state.data : []
  const groups: { name: string; kinds: NotificationKind[] }[] = []
  for (const kind of kinds) {
    const group = groups.at(-1)?.name === kind.group ? groups.at(-1)! : (groups.push({ name: kind.group, kinds: [] }), groups.at(-1)!)
    group.kinds.push(kind)
  }

  async function toggle(kind: string, enabled: boolean) {
    setSaving(kind)
    setFailed('')
    try {
      await save({ kind, enabled }).unwrap()
    } catch {
      setFailed("That couldn't be saved. Please try again.")
    } finally {
      setSaving(null)
    }
  }

  return { state, retry: () => void query.refetch(), groups, saving, failed, toggle: (kind: string, enabled: boolean) => void toggle(kind, enabled) }
}

/** What was raised, newest first, a page at a time, of every kind or the one picked. */
export function useNotificationHistoryViewModel() {
  const [page, setPage] = useState(1)
  const [kind, setKind] = useState<string | null>(null)
  const { data: kinds = [] } = useListNotificationKindsQuery()
  const paged = usePagedQuery(useListNotificationsQuery, { page, pageSize: NOTIFICATIONS_PAGE_SIZE, kind }, setPage)

  return {
    ...paged,
    page,
    setPage,
    kind,
    kinds,
    labelOf: (key: string) => kinds.find((k) => k.kind === key)?.label ?? key,
    chooseKind: (next: string) => {
      setKind(next || null)
      setPage(1)
    },
  }
}
