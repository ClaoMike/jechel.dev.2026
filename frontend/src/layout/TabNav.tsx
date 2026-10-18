import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth'
import { ArrowLeftIcon, ArrowRightIcon, EyeOffIcon } from '../components/icons'
import { useAppSelector } from '../store'
import { TABS } from './tabs'

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

/**
 * Links styled as tabs; the current one gets aria-current="page" (from NavLink). Admin-only tabs show
 * once signed in. One highlight glides to the tab that's picked, and can be dragged across from the
 * current tab: let go and it snaps to the nearest tab, which opens.
 */
export function TabNav() {
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const site = useAppSelector((state) => state.site)
  // Visitors see the pages that are switched on (none until that's known); the admin sees them all, hidden ones marked.
  const hidden = (tab: (typeof TABS)[number]) => tab.page !== undefined && site.status === 'loaded' && !site.site.pages[tab.page]
  const tabs = TABS.filter((tab) => (isAuthenticated ? true : !tab.adminOnly && site.status === 'loaded' && !hidden(tab)))

  const [box, setBox] = useState<Box | null>(null)
  // Off for the first placement, so the highlight doesn't fly in from the left on load.
  const [animate, setAnimate] = useState(false)
  const [dragBox, setDragBox] = useState<Box | null>(null)
  // Whether there are more tabs out of view on each side (narrow windows, phones): then an arrow shows there.
  const [more, setMore] = useState({ left: false, right: false })
  const drag = useRef<Drag | null>(null)
  const suppressClick = useRef(false)

  const tabElements = useCallback(() => [...(navRef.current?.querySelectorAll<HTMLAnchorElement>('.tab') ?? [])], [])

  const measure = useCallback(() => {
    const nav = navRef.current
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    setBox(active ? { left: active.offsetLeft, width: active.offsetWidth } : null)
    updateMore()
  }, [])

  function updateMore() {
    const nav = navRef.current
    if (!nav) return
    const left = nav.scrollLeft > 1
    const right = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1
    setMore((current) => (current.left === left && current.right === right ? current : { left, right }))
  }

  /** Scrolls the bar most of its width that way, so the next tabs come into view. */
  function scrollTabs(direction: -1 | 1) {
    const nav = navRef.current
    if (!nav) return
    nav.scrollBy?.({ left: direction * nav.clientWidth * 0.7, behavior: 'smooth' })
  }

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

  // On narrow screens the tabs scroll sideways: keep the current one in view.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [pathname])

  /** The tab whose middle is closest to `center`. */
  function nearestTab(center: number) {
    let best: HTMLAnchorElement | undefined
    for (const tab of tabElements()) {
      if (!best || Math.abs(tab.offsetLeft + tab.offsetWidth / 2 - center) < Math.abs(best.offsetLeft + best.offsetWidth / 2 - center)) best = tab
    }
    return best
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    // Only the current tab is a handle: dragging elsewhere scrolls the bar (phones) or does nothing.
    if (!box || !event.isPrimary || event.button !== 0 || !(event.target as HTMLElement).closest('[aria-current="page"]')) return
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
    drag.current = null
    if (!current?.moved || event.pointerId !== current.pointerId) return
    suppressClick.current = true
    const target = dragBox && nearestTab(dragBox.left + dragBox.width / 2)
    setDragBox(null)
    const to = target?.getAttribute('href')
    if (to && to !== pathname) navigate(to)
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

  const shown = dragBox ?? box
  return (
    <div className="tabs-frame" data-more-left={more.left || undefined} data-more-right={more.right || undefined}>
      {/* For pointers and fingers only: keyboards reach every tab with Tab (the current one is scrolled into view), so these stay out of the way. */}
      {more.left && (
        <button type="button" className="tabs-arrow tabs-arrow-left" tabIndex={-1} aria-hidden="true" onClick={() => scrollTabs(-1)}>
          <ArrowLeftIcon size={18} />
        </button>
      )}
    <nav
      ref={navRef}
      className="tabs"
      aria-label="Sections"
      data-dragging={dragBox ? '' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClickCapture={onClickCapture}
      onScroll={updateMore}
    >
      {shown && (
        <span
          className="tab-indicator"
          aria-hidden="true"
          data-animate={animate ? '' : undefined}
          style={{ width: shown.width, transform: `translateX(${shown.left}px)` }}
        />
      )}
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end className="tab" draggable={false} title={isAuthenticated && hidden(tab) ? 'Hidden from visitors' : undefined}>
          {tab.label}
          {isAuthenticated && hidden(tab) && (
            <>
              {' '}
              <span className="tab-hidden">
                <EyeOffIcon size={14} />
                <span className="visually-hidden">(hidden from visitors)</span>
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
      {more.right && (
        <button type="button" className="tabs-arrow tabs-arrow-right" tabIndex={-1} aria-hidden="true" onClick={() => scrollTabs(1)}>
          <ArrowRightIcon size={18} />
        </button>
      )}
    </div>
  )
}
