import { useEffect, useState, type AnimationEvent, type ReactNode } from 'react'
import { useLocation, useOutlet } from 'react-router'
import { motionAllowed } from '../../utils/motion'
import { tabIndex } from '../tabs'

type Direction = 'left' | 'right'

interface Leaving {
  key: string
  page: ReactNode
  /** Which way the pages move: "left" when going to a tab further right. */
  direction: Direction
}

/** The page on show, and the one sliding out (kept until its animation ends) and which way. */
export function usePageTransitionViewModel() {
  const { pathname } = useLocation()
  const outlet = useOutlet()
  // The page on screen and its path: when the path changes, this is the page that leaves. (Its
  // element is the one from when it arrived; rendered under the same key, it's the same instance.)
  const [shown, setShown] = useState({ path: pathname, page: outlet })
  const [leaving, setLeaving] = useState<Leaving | null>(null)

  if (pathname !== shown.path) {
    const from = tabIndex(shown.path)
    const to = tabIndex(pathname)
    setShown({ path: pathname, page: outlet })
    setLeaving(from >= 0 && to >= 0 && from !== to && motionAllowed() ? { key: shown.path, page: shown.page, direction: to > from ? 'left' : 'right' } : null)
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
