import { useCallback, useEffect, useRef, useState, type AnimationEvent } from 'react'
import type { PageArgs } from '../../store/api/appsApi'
import { usePagedQuery, type PagedQueryHook } from '../../store/usePagedQuery'
import { motionAllowed } from '../../utils/motion'
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

/** In case an animation never ends (e.g. the tab went to the background mid-way). */
export const SLIDE_FALLBACK_MS = 800

/**
 * The page in the URL (?page=2), its items from the store, and moving between pages (back to the grid's
 * top). The pages next to it are loaded ahead, so moving there shows them at once; and moving slides the
 * old page out and the new one in, sideways, unless the visitor asked for reduced motion.
 */
export function usePagedGridViewModel<T>(useItems: PagedQueryHook<T, PageArgs>, usePrefetchItems: () => PrefetchPage, pageSize: number) {
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

  const goToPage = useCallback(
    (next: number) => {
      setPage(next)
      top.current?.scrollIntoView?.({ block: 'start', behavior: motionAllowed() ? 'smooth' : 'instant' })
    },
    [setPage],
  )

  return {
    topRef: top,
    page,
    state,
    totalPages,
    retry,
    goToPage,
    leaving,
    enterClassName: entering ? `paged-grid-items grid-enter grid-to-${entering}` : 'paged-grid-items',
    leftView: (event: AnimationEvent) => {
      if (event.target === event.currentTarget) setLeaving(null)
    },
  }
}
