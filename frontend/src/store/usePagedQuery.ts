import { useEffect } from 'react'
import type { Page } from '../services/api'
import { pageCount, toLoadable, type Loadable } from './loadable'
import type { PageArgs } from './api/appsApi'

/** An RTK Query hook for a paged list, e.g. `useListAppsQuery`. */
export type PagedQueryHook<T, A extends PageArgs = PageArgs> = (args: A) => {
  currentData?: Page<T>
  isError: boolean
  isFetching: boolean
  refetch: () => unknown
}

/**
 * One page of a list from the store, for a view model that keeps the page number (in the URL, or its
 * own state). A stale page (e.g. ?page=9 after items were deleted) moves to the last one there is.
 */
export function usePagedQuery<T, A extends PageArgs>(useItems: PagedQueryHook<T, A>, args: A, goToPage: (page: number) => void) {
  const query = useItems(args)
  const state: Loadable<Page<T>> = toLoadable(query)
  const totalPages = state.status === 'loaded' ? pageCount(state.data.totalCount, args.pageSize) : 1

  useEffect(() => {
    if (state.status === 'loaded' && args.page > totalPages) goToPage(totalPages)
  }, [state.status, args.page, totalPages, goToPage])

  const { refetch } = query
  return { state, totalPages, retry: () => void refetch() }
}
