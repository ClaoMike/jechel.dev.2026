import { useCallback, useRef } from 'react'
import type { PageArgs } from '../../store/api/appsApi'
import { usePagedQuery, type PagedQueryHook } from '../../store/usePagedQuery'
import { usePageParam } from '../usePageParam'

/** What a grid says, written by the page's view model. */
export interface PagedGridTexts {
  /** Names the list for screen readers, e.g. "Videos". */
  label: string
  /** Read out while loading, e.g. "Loading videos…"; the grid shows placeholder tiles. */
  loading: string
  /** When there's nothing to show, e.g. "No videos yet." */
  empty: string
  /** Shown with a "Try again" button when the page can't be loaded. */
  error: string
}

/** The page in the URL (?page=2), its items from the store, and moving between pages (back to the grid's top). */
export function usePagedGridViewModel<T>(useItems: PagedQueryHook<T, PageArgs>, pageSize: number) {
  const [page, setPage] = usePageParam()
  const { state, totalPages, retry } = usePagedQuery(useItems, { page, pageSize }, setPage)
  const top = useRef<HTMLDivElement>(null)

  const goToPage = useCallback(
    (next: number) => {
      setPage(next)
      top.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    },
    [setPage],
  )

  return { topRef: top, page, state, totalPages, retry, goToPage }
}
