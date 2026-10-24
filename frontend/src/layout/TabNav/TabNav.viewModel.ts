import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAppSelector } from '../../store'
import { isCurrent, linkOf, TABS, type Tab } from '../tabs'

/** Where the highlight is, in the tab bar's own coordinates (it scrolls with the tabs). */
interface Box {
  left: number
  width: number
}

interface Drag {
  pointerId: number
  startX: number
  startLeft: number
  moved: boolean
}

/** A drag starts once the pointer has moved this far, so a tap stays a tap. */
const DRAG_THRESHOLD = 5

/** The bar counts as stopped once it hasn't scrolled for this long. */
const SCROLL_SETTLED_MS = 120

export interface TabItem extends Tab {
  /** The admin sees hidden pages too, marked. */
  hiddenFromVisitors: boolean
  /** Where its link goes (System: its first page). */
  link: string
  current: boolean
}

/**
 * The tabs that show (visitors: the pages that are switched on, none until that's known; the admin:
 * them all, hidden ones marked), the highlight that glides to the current one, dragging it across,
 * and the arrows for tabs out of view.
 */
export function useTabNavViewModel() {
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isAuthenticated = useAppSelector((state) => state.auth.status === 'authenticated')
  const site = useAppSelector((state) => state.site)
  const hidden = (tab: Tab) => tab.page !== undefined && site.status === 'loaded' && !site.site.pages[tab.page]
  const tabs: TabItem[] = TABS.filter((tab) => (isAuthenticated ? true : !tab.adminOnly && site.status === 'loaded' && !hidden(tab))).map((tab) => ({
    ...tab,
    hiddenFromVisitors: isAuthenticated && hidden(tab),
    link: linkOf(tab),
    current: isCurrent(tab, pathname),
  }))

  const [box, setBox] = useState<Box | null>(null)
  // Off for the first placement, so the highlight doesn't fly in from the left on load.
  const [animate, setAnimate] = useState(false)
  const [dragBox, setDragBox] = useState<Box | null>(null)
  // Whether there are more tabs out of view on each side (narrow windows, phones): then an arrow shows there.
  const [more, setMore] = useState({ left: false, right: false })
  // Where the arrows last sent the bar: a press while it's still gliding goes on from there, not from midway.
  const scrollTarget = useRef<number | null>(null)
  const scrollSettling = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const drag = useRef<Drag | null>(null)
  const suppressClick = useRef(false)

  const tabElements = useCallback(() => [...(navRef.current?.querySelectorAll<HTMLAnchorElement>('.tab') ?? [])], [])

  const updateMore = useCallback(() => {
    const nav = navRef.current
    if (!nav) return
    const left = nav.scrollLeft > 1
    const right = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1
    setMore((current) => (current.left === left && current.right === right ? current : { left, right }))
    // Stopped: the next press goes on from where the bar is.
    scrollTarget.current = null
  }, [])

  const measure = useCallback(() => {
    const active = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
    setBox(active ? { left: active.offsetLeft, width: active.offsetWidth } : null)
    updateMore()
  }, [updateMore])

  useLayoutEffect(measure, [measure, pathname, tabs.length])

  // Tabs change size with the window and once the font loads.
  useEffect(() => {
    const nav = navRef.current
    if (!nav || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(nav)
    for (const tab of tabElements()) observer.observe(tab)
    return () => observer.disconnect()
  }, [measure, tabElements, tabs.length])

  useEffect(() => {
    if (!box || animate) return
    const frame = requestAnimationFrame(() => setAnimate(true))
    return () => cancelAnimationFrame(frame)
  }, [box, animate])

  // On narrow screens the tabs scroll sideways: keep the current one in view. Also once the tabs come (the admin's appear
  // when the session is known, after the page has opened, e.g. on reloading Settings).
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [pathname, tabs.length])

  /**
   * Scrolls the bar most of its width that way, so the next tabs come into view, stopping at the end. Quick presses add
   * up: each goes on from where the last one was taking the bar.
   */
  function scrollTabs(direction: -1 | 1) {
    const nav = navRef.current
    if (!nav?.scrollTo) return
    const from = scrollTarget.current ?? nav.scrollLeft
    const to = Math.min(Math.max(from + direction * nav.clientWidth * 0.7, 0), nav.scrollWidth - nav.clientWidth)
    // Already going there (a press at the end while the bar glides to it, before the arrow goes): nothing to do. Asked
    // again, Safari starts the glide over and sometimes stops it short of the end.
    if (to === from) return
    scrollTarget.current = to
    nav.scrollTo({ left: to, behavior: 'smooth' })
  }

  /** The tab whose middle is closest to `center`. */
  function nearestTab(center: number) {
    let best: HTMLAnchorElement | undefined
    for (const tab of tabElements()) {
      if (!best || Math.abs(tab.offsetLeft + tab.offsetWidth / 2 - center) < Math.abs(best.offsetLeft + best.offsetWidth / 2 - center)) best = tab
    }
    return best
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    // A finger on the bar scrolls it itself: the arrows' last target no longer holds.
    scrollTarget.current = null
    // Only the current tab is a handle, and only for a mouse: a finger anywhere on the bar, the current tab too, scrolls it.
    if (!box || event.pointerType !== 'mouse' || !event.isPrimary || event.button !== 0 || !(event.target as HTMLElement).closest('[aria-current="page"]')) return
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startLeft: box.left, moved: false }
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const current = drag.current
    const nav = navRef.current
    if (!current || !nav || !box || event.pointerId !== current.pointerId) return
    const dx = event.clientX - current.startX
    if (!current.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return
      current.moved = true
      nav.setPointerCapture(event.pointerId)
    }
    const left = Math.min(Math.max(current.startLeft + dx, 0), nav.scrollWidth - box.width)
    // The highlight takes the width of the tab it's over.
    const under = nearestTab(left + box.width / 2)
    setDragBox({ left, width: under?.offsetWidth ?? box.width })
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const current = drag.current
    // Another finger lifting doesn't end this drag.
    if (!current || event.pointerId !== current.pointerId) return
    drag.current = null
    if (!current.moved) return
    // A mouse drag ends with a click (handled just after this), a finger's doesn't: either way the next one counts again.
    suppressClick.current = true
    setTimeout(() => {
      suppressClick.current = false
    }, 0)
    const target = dragBox && nearestTab(dragBox.left + dragBox.width / 2)
    setDragBox(null)
    // Back over the current tab (System too, on any of its pages) stays where it is.
    const to = target?.getAttribute('href')
    if (to && target?.getAttribute('aria-current') !== 'page') navigate(to)
  }

  function onPointerCancel() {
    drag.current = null
    setDragBox(null)
  }

  // A drag ends with a click on whatever is under the pointer: it mustn't open that too.
  function onClickCapture(event: MouseEvent<HTMLElement>) {
    if (!suppressClick.current) return
    suppressClick.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  // The arrows and fades follow the scroll once it has stopped, not during it: Safari on iPhone drew the tabs in the wrong
  // place when the fade changed mid-scroll.
  function onScroll() {
    clearTimeout(scrollSettling.current)
    scrollSettling.current = setTimeout(updateMore, SCROLL_SETTLED_MS)
  }
  useEffect(() => () => clearTimeout(scrollSettling.current), [])

  const shown = dragBox ?? box
  return {
    navRef,
    tabs,
    more,
    dragging: dragBox !== null,
    indicator: shown && { animate, style: { width: shown.width, transform: `translateX(${shown.left}px)` } satisfies CSSProperties },
    scrollLeft: () => scrollTabs(-1),
    scrollRight: () => scrollTabs(1),
    navHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture, onScroll },
  }
}
