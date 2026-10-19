import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { AppMedia } from '../../../services/api'

/** The slide on show: moved to by swiping or scrolling the track, the arrows, the dots or the arrow keys. Moving away pauses videos. */
export function useMediaCarouselViewModel(media: AppMedia[]) {
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
    el?.scrollTo?.({ left: clamped * el.clientWidth, behavior: 'smooth' })
    setIndex(clamped)
  }

  return {
    trackRef: track,
    index,
    goTo,
    previous: () => goTo(index - 1),
    next: () => goTo(index + 1),
    // Swiping or scrolling the track itself.
    onScroll: () => {
      const el = track.current
      if (el && el.clientWidth > 0) setIndex(Math.round(el.scrollLeft / el.clientWidth))
    },
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        goTo(index + (event.key === 'ArrowLeft' ? -1 : 1))
      }
    },
  }
}
