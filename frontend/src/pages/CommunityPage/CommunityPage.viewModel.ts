import { useState } from 'react'
import { useDecideAnnouncementMutation, useDeleteSubscriberMutation, useListAnnouncementsQuery, useListDonationsQuery, useListSubscribersQuery } from '../../store/api/communityApi'
import { usePagedQuery, type PagedQueryHook, type PagedQueryOptions } from '../../store/usePagedQuery'

const PAGE_SIZE = 20

/** While an update email is waiting to go out or going out: how often its count is asked again. */
export const SENDING_REFRESH_MS = 2000

/** One page of a list at a time, with its own page number (not in the URL: the tab holds several lists). */
function usePagedList<T>(useItems: PagedQueryHook<T>, options?: PagedQueryOptions) {
  const [page, setPage] = useState(1)
  return { page, setPage, ...usePagedQuery(useItems, { page, pageSize: PAGE_SIZE }, setPage, options) }
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

  // An email on its way: asked again until it's sent, so its count is right without reloading the page.
  const [onItsWay, setOnItsWay] = useState(false)
  const list = usePagedList(useListAnnouncementsQuery, { pollingInterval: onItsWay ? SENDING_REFRESH_MS : 0 })
  const sending = list.state.status === 'loaded' && list.state.data.items.some((a) => a.status === 'approved' || a.status === 'sending')
  if (sending !== onItsWay) setOnItsWay(sending)

  return {
    ...list,
    failed,
    send: (id: number) => void decideOne(id, 'send'),
    ignore: (id: number) => void decideOne(id, 'ignore'),
  }
}

export function useDonationsViewModel() {
  return usePagedList(useListDonationsQuery)
}
