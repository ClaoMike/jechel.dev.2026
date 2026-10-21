import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { AppMedia } from '../../../services/api'

/** The slide on show: moved to by swiping or scrolling the track, the arrows, the dots or the arrow keys. Moving away pauses videos. */
export function useMediaCarouselViewModel({ media, title }: { media: AppMedia[]; title: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    track.current?.querySelectorAll('video').forEach((video) => {
      if (Number(video.dataset.index) !== index && !video.paused) video.pause()
    })
  }, [index])

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(media.length - 1, next))
    const el = track.current
    // Slides over, unless the visitor asked for less motion.
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    el?.scrollTo?.({ left: clamped * el.clientWidth, behavior: still ? 'instant' : 'smooth' })
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
    // Swiping or scrolling the track itself. Only where it rests on a slide (scroll-snap and the arrows'
    // scrolls end there), so the slides passed on the way don't count: the count doesn't flicker back, and a
    // video passed by isn't loaded.
    onScroll: () => {
      const el = track.current
      if (!el || el.clientWidth === 0) return
      const position = el.scrollLeft / el.clientWidth
      const slide = Math.round(position)
      if (Math.abs(position - slide) < 0.01) setIndex(slide)
    },
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        goTo(index + (event.key === 'ArrowLeft' ? -1 : 1))
      }
    },
  }
}
