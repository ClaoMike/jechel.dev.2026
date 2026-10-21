import type { ComponentType, ReactNode } from 'react'
import type { PageArgs } from '../../store/api/appsApi'
import type { PagedQueryHook } from '../../store/usePagedQuery'
import { ErrorState } from '../ErrorState/ErrorState'
import { usePagedGridViewModel, type PagedGridTexts, type PrefetchPage } from './PagedGrid.viewModel'
import { Pagination } from '../Pagination'
import { Loading, SkeletonMediaGrid } from '../Skeleton'

export interface PagedGridProps<T, P extends object = object> {
  /** The list's RTK Query hook, e.g. `useListAppsQuery`: loads one page (1-based). */
  useItems: PagedQueryHook<T, PageArgs>
  /** Loads a page ahead, e.g. `usePrefetchApps`: the pages next to the one on show are loaded before they're asked for. */
  usePrefetchItems: () => PrefetchPage
  /** Items per page; 9 fills a 3 × 3 grid. */
  pageSize?: number
  itemKey: (item: T) => string | number
  /** Each item's tile: a component given the item, and `tileProps`. */
  Tile: ComponentType<{ item: T } & P>
  /** What every tile gets besides its item, e.g. what clicking it does. */
  tileProps: P
  /** Its label, loading, empty and error texts. */
  texts: PagedGridTexts
  /** A tile before the items on the first page, e.g. the admin's "Add" button. Shown even when there are no items. */
  leading?: ReactNode
  /** What goes with the grid, after it, e.g. the popup a tile opens. */
  children?: ReactNode
}

/**
 * Items in a grid (3 columns, fewer on narrow screens), a page at a time, with Previous / Next
 * under it. The page is in the URL (?page=2), so it survives a reload and can be shared. Moving to
 * another page slides the old one out and the new one in, from the side it's on; the pages next to
 * the one on show are loaded ahead.
 */
export function PagedGrid<T, P extends object = object>({
  useItems,
  usePrefetchItems,
  pageSize = 9,
  itemKey,
  Tile,
  tileProps,
  texts,
  leading,
  children,
}: PagedGridProps<T, P>) {
  const { topRef, ...vm } = usePagedGridViewModel(useItems, usePrefetchItems, pageSize)
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
          <div className="paged-grid-stage">
            {vm.leaving && (
              <ul
                key={`page-${vm.leaving.page}`}
                className={`paged-grid-items grid-leave grid-to-${vm.leaving.direction}`}
                inert
                aria-hidden="true"
                onAnimationEnd={vm.leftView}
              >
                {leading && vm.leaving.page === 1 && <li>{leading}</li>}
                {vm.leaving.items.map((item) => (
                  <li key={itemKey(item)}>
                    <Tile item={item} {...tileProps} />
                  </li>
                ))}
              </ul>
            )}
            <ul key={`page-${vm.page}`} className={vm.enterClassName} aria-label={label}>
              {leading && vm.page === 1 && <li>{leading}</li>}
              {state.data.items.map((item) => (
                <li key={itemKey(item)}>
                  <Tile item={item} {...tileProps} />
                </li>
              ))}
            </ul>
          </div>
          <Pagination page={vm.page} totalPages={vm.totalPages} onPageChange={vm.goToPage} />
        </>
      )}
      {children}
    </div>
  )
}
