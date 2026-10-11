import { useEffect, useState, type AnimationEvent, type ReactNode } from 'react'
import { useLocation, useOutlet } from 'react-router'
import { tabIndex } from './tabs'

type Direction = 'left' | 'right'

interface Leaving {
  key: string
  page: ReactNode
  /** Which way the pages move: "left" when going to a tab further right. */
  direction: Direction
}

function motionAllowed() {
  return window.matchMedia !== undefined && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * The current tab's page. Switching tabs slides the pages sideways: the old one out, the new one in,
 * in the direction of the tab that was picked. The old page stays mounted (inert) until it's gone.
 */
export function PageTransition() {
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
    setLeaving(
      from >= 0 && to >= 0 && from !== to && motionAllowed()
        ? { key: shown.path, page: shown.page, direction: to > from ? 'left' : 'right' }
        : null,
    )
  }

  // In case the animation never ends (e.g. the tab went to the background mid-way).
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => setLeaving(null), 800)
    return () => clearTimeout(timer)
  }, [leaving])

  const done = (event: AnimationEvent) => {
    if (event.target === event.currentTarget) setLeaving(null)
  }

  return (
    <div className="page-stage">
      {leaving && (
        <div key={leaving.key} className={`page-slide page-leave page-to-${leaving.direction}`} inert aria-hidden="true" onAnimationEnd={done}>
          {leaving.page}
        </div>
      )}
      <div key={pathname} className={leaving ? `page-slide page-enter page-to-${leaving.direction}` : 'page-slide'}>
        {outlet}
      </div>
    </div>
  )
}
