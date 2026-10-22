import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { AppMedia } from '../../../services/api'
import { motionAllowed } from '../../../utils/motion'
import { trackEvent } from '../../analytics'

/** How long an arrow's scroll may take to arrive before the track's own position counts again. */
export const ARRIVAL_TIMEOUT_MS = 1000

/** The slide on show: moved to by swiping or scrolling the track, the arrows, the dots or the arrow keys. Moving away pauses videos. */
export function useMediaCarouselViewModel({ media, title }: { media: AppMedia[]; title: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  // The slide an arrow, dot or key is scrolling to. Until it gets there, where the track is doesn't
  // change the count: a smooth scroll's first frames still rest on the slide it leaves, which would
  // set the count back to it for a moment.
  const scrollingTo = useRef<number | null>(null)
  const arrival = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /** The slide the track rests on (scroll-snap and every scroll end there), or null mid-way. */
  const restingOn = (): number | null => {
    const el = track.current
    if (!el || el.clientWidth === 0) return null
    const position = el.scrollLeft / el.clientWidth
    const slide = Math.round(position)
    return Math.abs(position - slide) < 0.01 ? slide : null
  }

  useEffect(() => () => clearTimeout(arrival.current), [])

  useEffect(() => {
    track.current?.querySelectorAll('video').forEach((video) => {
      if (Number(video.dataset.index) !== index && !video.paused) video.pause()
    })
  }, [index])

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(media.length - 1, next))
    const el = track.current
    scrollingTo.current = clamped
    clearTimeout(arrival.current)
    // If it never gets there (a swipe took over), the track's own position counts again.
    arrival.current = setTimeout(() => {
      scrollingTo.current = null
      const slide = restingOn()
      if (slide !== null) setIndex(slide)
    }, ARRIVAL_TIMEOUT_MS)
    // Slides over, unless the visitor asked for less motion.
    el?.scrollTo?.({ left: clamped * el.clientWidth, behavior: motionAllowed() ? 'smooth' : 'instant' })
    setIndex(clamped)
  }

  return {
    trackRef: track,
    label: `${title}: images and videos`,
    slides: media.map((item, i) => ({
      key: `${item.url}-${i}`,
      position: `${i + 1} of ${media.length}`,
      item,
      index: i,
      active: i === index,
      label: `${title}, ${item.kind === 'image' ? 'image' : 'video'} ${i + 1} of ${media.length}`,
      show: () => goTo(i),
    })),
    controls:
      media.length > 1
        ? {
            dots: media.map((_, i) => ({ key: i, label: `Show ${i + 1} of ${media.length}`, current: i === index, show: () => goTo(i) })),
            count: `${index + 1} / ${media.length}`,
            canGoBack: index > 0,
            canGoOn: index < media.length - 1,
            previous: () => goTo(index - 1),
            next: () => goTo(index + 1),
          }
        : null,
    // Swiping or scrolling the track itself. Only where it rests on a slide, so the slides passed on the
    // way don't count (the count doesn't flicker back, and a video passed by isn't loaded); and not while
    // an arrow's scroll is on its way.
    onScroll: () => {
      const slide = restingOn()
      if (scrollingTo.current !== null) {
        if (slide === scrollingTo.current) {
          scrollingTo.current = null
          clearTimeout(arrival.current)
        }
        return
      }
      if (slide !== null && slide !== index) {
        setIndex(slide)
        trackEvent('Swiped to another slide', { app: title, slide: `${slide + 1} of ${media.length}` })
      }
    },
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const next = Math.max(0, Math.min(media.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)))
        if (next !== index) trackEvent('Moved to another slide with the keyboard', { app: title, slide: `${next + 1} of ${media.length}` })
        goTo(next)
      }
    },
  }
}
