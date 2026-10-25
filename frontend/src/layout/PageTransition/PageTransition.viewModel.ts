import { useEffect, useState, type AnimationEvent, type ReactNode } from 'react'
import { useLocation, useNavigationType, useOutlet } from 'react-router'
import { motionAllowed } from '../../utils/motion'
import { tabIndex } from '../tabs'
import type { SwipeState } from '../useSwipeNavigation'

type Direction = 'left' | 'right'

interface Leaving {
  key: string
  page: ReactNode
  /** Which way the pages move: "left" when going to a tab further right. */
  direction: Direction
}

/** The page on show, and the one sliding out (kept until its animation ends) and which way. */
export function usePageTransitionViewModel() {
  const { pathname, state } = useLocation()
  const navigationType = useNavigationType()
  const outlet = useOutlet()
  // The page on screen and its path: when the path changes, this is the page that leaves. (Its
  // element is the one from when it arrived; rendered under the same key, it's the same instance.)
  const [shown, setShown] = useState({ path: pathname, page: outlet })
  const [leaving, setLeaving] = useState<Leaving | null>(null)

  if (pathname !== shown.path) {
    const from = tabIndex(shown.path)
    const to = tabIndex(pathname)
    // A swipe says which way (it also goes between pages at one place in the order, Feature Testing's), when it's
    // the swipe itself: back or forward to that page later goes by the order.
    const swiped = navigationType === 'PUSH' ? (state as Partial<SwipeState> | null)?.slide : undefined
    const direction = swiped ?? (from >= 0 && to >= 0 && from !== to ? (to > from ? 'left' : 'right') : null)
    setShown({ path: pathname, page: outlet })
    setLeaving(direction && motionAllowed() ? { key: shown.path, page: shown.page, direction } : null)
  }

  // In case the animation never ends (e.g. the tab went to the background mid-way).
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => setLeaving(null), 800)
    return () => clearTimeout(timer)
  }, [leaving])

  return {
    pathname,
    outlet,
    leaving,
    enterClassName: leaving ? `page-slide page-enter page-to-${leaving.direction}` : 'page-slide',
    leftView: (event: AnimationEvent) => {
      if (event.target === event.currentTarget) setLeaving(null)
    },
  }
}
