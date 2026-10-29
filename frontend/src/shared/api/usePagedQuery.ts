import { useEffect } from 'react'
import type { Page } from './api'
import { pageCount, toLoadable, type Loadable } from './loadable'

/** Which page of a paged list, and how many items a page has. */
export interface PageArgs {
  page: number
  pageSize: number
}

/** An RTK Query hook for a paged list, e.g. `useListAppsQuery`. */
export type PagedQueryHook<T, A extends PageArgs = PageArgs> = (
  args: A,
  options?: PagedQueryOptions,
) => { currentData?: Page<T>; isError: boolean; isFetching: boolean; refetch: () => unknown }

/** E.g. `{ pollingInterval: 60_000 }`: loads the page again every minute while it's shown. */
export interface PagedQueryOptions {
  pollingInterval?: number
}

/**
 * One page of a list from the store, for a component that keeps the page number (in the URL, or its
 * own state). A stale page (e.g. ?page=9 after items were deleted) moves to the last one there is.
 */
export function usePagedQuery<T, A extends PageArgs>(useItems: PagedQueryHook<T, A>, args: A, goToPage: (page: number) => void, options?: PagedQueryOptions) {
  const query = useItems(args, options)
  const state: Loadable<Page<T>> = toLoadable(query)
  const totalPages = state.status === 'loaded' ? pageCount(state.data.totalCount, args.pageSize) : 1

  useEffect(() => {
    if (state.status === 'loaded' && args.page > totalPages) goToPage(totalPages)
  }, [state.status, args.page, totalPages, goToPage])

  const { refetch } = query
  return { state, totalPages, retry: () => void refetch() }
}
