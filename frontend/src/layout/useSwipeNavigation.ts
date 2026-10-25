import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { TEST_FEATURES } from '../features/featureTesting/testFeatures'
import { swipeTarget } from './tabs'
import { useShownTabs } from './useShownTabs'

/** How far sideways a finger has to go for a swipe (shorter is a nudge, or a tap). */
export const SWIPE_DISTANCE = 60

/** Touches starting this close to either side of the screen are the browser's (Safari's back and forward). */
export const SWIPE_EDGE = 24

/** A swipe is quick: a finger held longer is reading, or selecting text. */
export const SWIPE_MAX_MS = 800

/** What a touch on it is its own: a popup, typing, picking, or something marked so. */
const OWN_TOUCH = 'dialog, [role="dialog"], input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-no-swipe]'

/** Which way the page slides in: from the right for the next one (see PageTransition). */
export interface SwipeState {
  slide: 'left' | 'right'
}

/** Whether something between the touch and the page scrolls sideways (a carousel, a wide table, the tab bar): the swipe is its. */
function scrollsSideways(from: Element, page: Element) {
  for (let el: Element | null = from; el && el !== page; el = el.parentElement) {
    if (el.scrollWidth <= el.clientWidth + 1) continue
    const overflow = getComputedStyle(el).overflowX
    if (overflow === 'auto' || overflow === 'scroll') return true
  }
  return false
}

/**
 * A swipe sideways on the page goes to the next tab (to the left) or the previous one (to the right), in the tab bar's
 * order; on System's pages, to the next or previous of those (see swipeTarget). Only a clear, quick, sideways swipe of
 * one finger counts, and not one that starts at the screen's edge, in a field, on something that scrolls sideways
 * itself, or while zoomed in. `enabled`: off while there's no page to leave (maintenance) or it's hidden (Vice).
 */
export function useSwipeNavigation(enabled: boolean) {
  const pageRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const tabs = useShownTabs()
  // Read when a swipe ends, so the listeners don't need adding again on every page.
  const latest = useRef({ pathname, tabs, navigate })
  useEffect(() => {
    latest.current = { pathname, tabs, navigate }
  })

  useEffect(() => {
    const page = pageRef.current
    if (!enabled || !page) return
    let start: { x: number; y: number; at: number } | null = null

    const onStart = (event: TouchEvent) => {
      start = null
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      const target = event.target instanceof Element ? event.target : null
      if (!target || target.closest(OWN_TOUCH) || scrollsSideways(target, page)) return
      if (touch.clientX < SWIPE_EDGE || touch.clientX > window.innerWidth - SWIPE_EDGE) return
      if ((window.visualViewport?.scale ?? 1) > 1.01) return
      start = { x: touch.clientX, y: touch.clientY, at: event.timeStamp }
    }

    const onEnd = (event: TouchEvent) => {
      const from = start
      start = null
      const touch = event.changedTouches[0]
      if (!from || !touch || event.touches.length > 0 || event.timeStamp - from.at > SWIPE_MAX_MS) return
      const dx = touch.clientX - from.x
      const dy = touch.clientY - from.y
      if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < 2 * Math.abs(dy)) return
      // Selecting text with a long press isn't a swipe.
      if (window.getSelection()?.toString()) return
      const { pathname, tabs, navigate } = latest.current
      const to = swipeTarget(
        pathname,
        tabs,
        TEST_FEATURES.map((feature) => feature.slug),
        dx < 0 ? 'next' : 'previous',
      )
      if (to) void navigate(to, { state: { slide: dx < 0 ? 'left' : 'right' } satisfies SwipeState })
    }

    const onCancel = () => {
      start = null
    }

    page.addEventListener('touchstart', onStart, { passive: true })
    page.addEventListener('touchend', onEnd, { passive: true })
    page.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      page.removeEventListener('touchstart', onStart)
      page.removeEventListener('touchend', onEnd)
      page.removeEventListener('touchcancel', onCancel)
    }
  }, [enabled])

  return pageRef
}
