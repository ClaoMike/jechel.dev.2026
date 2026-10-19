import type { ReactNode } from 'react'
import type { PageArgs } from '../../store/api/appsApi'
import type { PagedQueryHook } from '../../store/usePagedQuery'
import { ErrorState } from '../ErrorState/ErrorState'
import { usePagedGridViewModel, type PagedGridTexts } from './PagedGrid.viewModel'
import { Pagination } from '../Pagination'
import { Loading, SkeletonMediaGrid } from '../Skeleton'

export interface PagedGridProps<T> {
  /** The list's RTK Query hook, e.g. `useListAppsQuery`: loads one page (1-based). */
  useItems: PagedQueryHook<T, PageArgs>
  /** Items per page; 9 fills a 3 × 3 grid. */
  pageSize?: number
  itemKey: (item: T) => string | number
  renderItem: (item: T) => ReactNode
  /** Its label, loading, empty and error texts. */
  texts: PagedGridTexts
  /** A tile before the items on the first page, e.g. the admin's "Add" button. Shown even when there are no items. */
  leading?: ReactNode
  /** What goes with the grid, after it, e.g. the popup a tile opens. */
  children?: ReactNode
}

/**
 * Items in a grid (3 columns, fewer on narrow screens), a page at a time, with Previous / Next
 * under it. The page is in the URL (?page=2), so it survives a reload and can be shared.
 */
export function PagedGrid<T>({
  useItems,
  pageSize = 9,
  itemKey,
  renderItem,
  texts,
  leading,
  children,
}: PagedGridProps<T>) {
  const { topRef, ...vm } = usePagedGridViewModel(useItems, pageSize)
  const { state } = vm
  const { label, loading, empty, error } = texts

  return (
    <div ref={topRef} className="paged-grid">
      {state.status === 'loading' && (
        <Loading label={loading}>
          <SkeletonMediaGrid count={Math.min(pageSize, 6)} />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message={error} onRetry={vm.retry} />}
      {state.status === 'loaded' && state.data.totalCount === 0 && !leading && <p className="muted">{empty}</p>}
      {state.status === 'loaded' && (state.data.items.length > 0 || (leading && vm.page === 1)) && (
        <>
          <ul className="paged-grid-items" aria-label={label}>
            {leading && vm.page === 1 && <li>{leading}</li>}
            {state.data.items.map((item) => (
              <li key={itemKey(item)}>{renderItem(item)}</li>
            ))}
          </ul>
          <Pagination page={vm.page} totalPages={vm.totalPages} onPageChange={vm.goToPage} />
        </>
      )}
      {children}
    </div>
  )
}
