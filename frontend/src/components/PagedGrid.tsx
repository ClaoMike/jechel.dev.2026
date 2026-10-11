import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Page } from '../services/api'
import { Pagination } from './Pagination'
import { usePageParam } from './usePageParam'

export interface PagedGridProps<T> {
  /** Loads one page (1-based). Keep it the same function between renders, or it loads again. */
  load: (page: number, pageSize: number, signal: AbortSignal) => Promise<Page<T>>
  /** Items per page; 9 fills a 3 × 3 grid. */
  pageSize?: number
  itemKey: (item: T) => string | number
  renderItem: (item: T) => ReactNode
  /** Names the list for screen readers, e.g. "Videos". */
  label: string
  /** A tile before the items on the first page, e.g. the admin's "Add" button. Shown even when there are no items. */
  leading?: ReactNode
  /** Change it to load the current page again, e.g. after adding an item. */
  reloadKey?: unknown
  loading?: ReactNode
  empty?: ReactNode
  error?: ReactNode
}

type Result<T> = { page: number } & ({ status: 'loaded'; data: Page<T> } | { status: 'error' })

/**
 * Items in a grid (3 columns, fewer on narrow screens), a page at a time, with Previous / Next
 * under it. The page is in the URL (?page=2), so it survives a reload and can be shared.
 */
export function PagedGrid<T>({
  load,
  pageSize = 9,
  itemKey,
  renderItem,
  label,
  leading,
  reloadKey,
  loading = <p>Loading…</p>,
  empty = <p className="muted">Nothing here yet.</p>,
  error = <p role="alert">This couldn't be loaded. Please try again later.</p>,
}: PagedGridProps<T>) {
  const [page, setPage] = usePageParam()
  // The last response, and the page it belongs to: while it's for another page, that page is loading.
  const [result, setResult] = useState<Result<T> | null>(null)
  const state = result && result.page === page ? result : null
  const top = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    load(page, pageSize, controller.signal)
      .then((data) => setResult({ status: 'loaded', page, data }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ status: 'error', page })
      })
    return () => controller.abort()
  }, [load, page, pageSize, reloadKey])

  const totalPages = state?.status === 'loaded' ? Math.max(1, Math.ceil(state.data.totalCount / pageSize)) : 1

  // A stale link (e.g. ?page=9 when there are fewer pages now): show the last page instead.
  useEffect(() => {
    if (state?.status === 'loaded' && page > totalPages) setPage(totalPages)
  }, [state?.status, page, totalPages, setPage])

  const goToPage = useCallback(
    (next: number) => {
      setPage(next)
      top.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    },
    [setPage],
  )

  return (
    <div ref={top} className="paged-grid">
      {state === null && loading}
      {state?.status === 'error' && error}
      {state?.status === 'loaded' && state.data.totalCount === 0 && !leading && empty}
      {state?.status === 'loaded' && (state.data.items.length > 0 || (leading && page === 1)) && (
        <>
          <ul className="paged-grid-items" aria-label={label}>
            {leading && page === 1 && <li>{leading}</li>}
            {state.data.items.map((item) => (
              <li key={itemKey(item)}>{renderItem(item)}</li>
            ))}
          </ul>
          <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
        </>
      )}
    </div>
  )
}
