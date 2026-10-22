import { useState, type MouseEvent } from 'react'
import { usePageParam } from '../../../components/usePageParam'
import type { ContactMessageSummary } from '../../../services/api'
import { useDeleteMessageMutation, useListMessagesQuery } from '../../../store/api/contactApi'
import { usePagedQuery } from '../../../store/usePagedQuery'

export const PAGE_SIZE = 10

/** Emails come in at any time: the inbox looks again every minute while it's open. */
export const INBOX_REFRESH_MS = 60_000

/** The page of messages (?page=N), the one that's open, and deleting. */
export function useMessagesInboxViewModel() {
  const [page, goToPage] = usePageParam()
  const { state, totalPages, retry } = usePagedQuery(useListMessagesQuery, { page, pageSize: PAGE_SIZE }, goToPage, { pollingInterval: INBOX_REFRESH_MS })
  const [open, setOpen] = useState<ContactMessageSummary | null>(null)
  const [deleteMessage] = useDeleteMessageMutation()

  return {
    state,
    page,
    totalPages,
    goToPage,
    retry,
    open,
    openMessage: setOpen,
    // The name button handles its own clicks (and keyboard); this makes the whole row clickable.
    rowClicked: (event: MouseEvent, message: ContactMessageSummary) => {
      if (!(event.target as HTMLElement).closest('button')) setOpen(message)
    },
    close: () => setOpen(null),
    deleteMessage: async (id: number) => {
      await deleteMessage(id).unwrap()
      setOpen((current) => (current?.id === id ? null : current))
    },
  }
}
