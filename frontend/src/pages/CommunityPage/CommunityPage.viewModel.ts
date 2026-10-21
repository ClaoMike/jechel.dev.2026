import { useState } from 'react'
import { useDecideAnnouncementMutation, useDeleteSubscriberMutation, useListAnnouncementsQuery, useListDonationsQuery, useListSubscribersQuery } from '../../store/api/communityApi'
import { usePagedQuery, type PagedQueryHook } from '../../store/usePagedQuery'

const PAGE_SIZE = 20

/** One page of a list at a time, with its own page number (not in the URL: the tab holds several lists). */
function usePagedList<T>(useItems: PagedQueryHook<T>) {
  const [page, setPage] = useState(1)
  return { page, setPage, ...usePagedQuery(useItems, { page, pageSize: PAGE_SIZE }, setPage) }
}

export function useSubscribersViewModel() {
  const [deleteSubscriber] = useDeleteSubscriberMutation()
  return { ...usePagedList(useListSubscribersQuery), deleteSubscriber: (id: number) => deleteSubscriber(id).unwrap() }
}

export function useAnnouncementsViewModel() {
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

  return {
    ...usePagedList(useListAnnouncementsQuery),
    failed,
    send: (id: number) => void decideOne(id, 'send'),
    ignore: (id: number) => void decideOne(id, 'ignore'),
  }
}

export function useDonationsViewModel() {
  return usePagedList(useListDonationsQuery)
}
