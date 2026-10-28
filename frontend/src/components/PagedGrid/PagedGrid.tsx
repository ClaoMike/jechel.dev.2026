import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import type { PageArgs } from '../../store/api/appsApi'
import { usePagedQuery, type PagedQueryHook } from '../../store/usePagedQuery'
import { motionAllowed } from '../../utils/motion'
import { ErrorState } from '../ErrorState/ErrorState'
import { Pagination } from '../Pagination'
import { Loading, SkeletonMediaGrid } from '../Skeleton'
import { usePageParam } from '../usePageParam'
import { RESIZE, SLIDE_FALLBACK_MS } from './slide'

/** What a grid says, written by the page. */
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

/** Loads a page ahead, unless it's already loaded and fresh, e.g. `usePrefetchVideos()`. */
export type PrefetchPage = (args: PageArgs) => void

/** Which way the pages move: "left" when going to a later page (it comes in from the right). */
export type SlideDirection = 'left' | 'right'

/** A page's items on screen, by page. */
interface ShownPage<T> {
  page: number
  items: T[]
}

/** The last page shown, and whether it's still on screen (not while placeholders are). */
interface LastPage<T> extends ShownPage<T> {
  onScreen: boolean
}

/** The page sliding out, kept until its animation ends. */
export interface LeavingPage<T> extends ShownPage<T> {
  direction: SlideDirection
}

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
 * another page slides the old one out and the new one in, from the side it's on, while the grid's
 * height follows (what's under it glides rather than jumps); the pages next to the one on show are
 * loaded ahead. Without reduced motion only: otherwise pages just swap.
 */
export function PagedGrid<T, P extends object = object>({ useItems, usePrefetchItems, pageSize = 9, itemKey, Tile, tileProps, texts, leading, children }: PagedGridProps<T, P>) {
  const [page, setPage] = usePageParam()
  const { state, totalPages, retry } = usePagedQuery(useItems, { page, pageSize }, setPage)
  const prefetch = usePrefetchItems()
  const top = useRef<HTMLDivElement>(null)

  // Once a page is on show, its neighbours are loaded ahead (RTK Query skips the ones it has fresh).
  const loaded = state.status === 'loaded'
  useEffect(() => {
    if (!loaded) return
    for (const next of [page + 1, page - 1]) {
      if (next >= 1 && next <= totalPages) prefetch({ page: next, pageSize })
    }
  }, [loaded, page, pageSize, totalPages, prefetch])

  // The last page shown: when another one arrives, it slides out (if still on screen) and the new one
  // comes in from the side it's on. A refresh of the same page, or the first page shown, doesn't move.
  // Otherwise the moved-from page stays set, so a page that comes after placeholders still knows its side.
  const [last, setLast] = useState<LastPage<T> | null>(null)
  const [leaving, setLeaving] = useState<LeavingPage<T> | null>(null)
  const [entering, setEntering] = useState<SlideDirection | null>(null)
  if (state.status === 'loaded' && (last?.page !== page || last.items !== state.data.items || !last.onScreen)) {
    // From a page with nothing on it (e.g. an old link past the end, moved to the last page): no slide.
    if (last !== null && last.page !== page && last.items.length > 0) {
      const animate = motionAllowed()
      const direction: SlideDirection = page > last.page ? 'left' : 'right'
      setLeaving(animate && last.onScreen ? { page: last.page, items: last.items, direction } : null)
      setEntering(animate ? direction : null)
    }
    setLast({ page, items: state.data.items, onScreen: true })
  } else if (state.status !== 'loaded' && last?.onScreen) {
    setLast({ ...last, onScreen: false })
  }

  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => setLeaving(null), SLIDE_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [leaving])

  // While a page slides in, the grid's height goes from the old page's to the new one's (rather than
  // jumping), so what's under it (Previous / Next) moves smoothly, up for a shorter page, down for a taller.
  const stage = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = stage.current
    const old = el?.querySelector<HTMLElement>(':scope > .grid-leave')
    const current = el?.querySelector<HTMLElement>(':scope > .grid-enter')
    if (!el || !old || !current || old.offsetHeight === current.offsetHeight) return
    el.classList.add('grid-resizing')
    const resize = el.animate([{ height: `${old.offsetHeight}px` }, { height: `${current.offsetHeight}px` }], RESIZE)
    const done = () => el.classList.remove('grid-resizing')
    resize.addEventListener('finish', done)
    resize.addEventListener('cancel', done)
  }, [leaving])

  const goToPage = useCallback(
    (next: number) => {
      setPage(next)
      top.current?.scrollIntoView?.({ block: 'start', behavior: motionAllowed() ? 'smooth' : 'instant' })
    },
    [setPage],
  )

  const enterClassName = entering ? `paged-grid-items grid-enter grid-to-${entering}` : 'paged-grid-items'
  const { label, loading, empty, error } = texts

  return (
    <div ref={top} className="paged-grid">
      {state.status === 'loading' && (
        <Loading label={loading}>
          <SkeletonMediaGrid count={Math.min(pageSize, 6)} />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message={error} onRetry={retry} />}
      {state.status === 'loaded' && state.data.totalCount === 0 && !leading && <p className="muted">{empty}</p>}
      {state.status === 'loaded' && (state.data.items.length > 0 || (leading && page === 1)) && (
        <>
          <div ref={stage} className="paged-grid-stage">
            {leaving && (
              <ul
                key={`page-${leaving.page}`}
                className={`paged-grid-items grid-leave grid-to-${leaving.direction}`}
                inert
                aria-hidden="true"
                onAnimationEnd={(event) => {
                  if (event.target === event.currentTarget) setLeaving(null)
                }}
              >
                {leading && leaving.page === 1 && <li>{leading}</li>}
                {leaving.items.map((item) => (
                  <li key={itemKey(item)}>
                    <Tile item={item} {...tileProps} />
                  </li>
                ))}
              </ul>
            )}
            <ul key={`page-${page}`} className={enterClassName} aria-label={label}>
              {leading && page === 1 && <li>{leading}</li>}
              {state.data.items.map((item) => (
                <li key={itemKey(item)}>
                  <Tile item={item} {...tileProps} />
                </li>
              ))}
            </ul>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
        </>
      )}
      {children}
    </div>
  )
}
