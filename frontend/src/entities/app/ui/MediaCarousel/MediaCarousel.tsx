import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { AppMedia } from '@/shared/api'
import { CarouselControls } from '../CarouselControls/CarouselControls'
import { MediaSlide } from '../MediaSlide/MediaSlide'
import { motionAllowed } from '@/shared/lib/browser'
import { trackEvent } from '@/shared/lib/analytics'
import { strings } from '@/shared/i18n'

/** How long an arrow's scroll may take to arrive before the track's own position counts again. */
export const ARRIVAL_TIMEOUT_MS = 1000

/**
 * Images and videos side by side, one at a time: swipe or scroll sideways, use the arrows or
 * dots, or the arrow keys. Moving away from a video pauses it; a YouTube video's player is only
 * loaded on its own slide (elsewhere it's a thumbnail), so moving away stops it too.
 */
export function MediaCarousel({ media, title }: { media: AppMedia[]; title: string }) {
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
  const slides = media.map((item, i) => ({
    key: `${item.url}-${i}`,
    position: strings.mediaCarousel.of(i + 1, media.length),
    item,
    index: i,
    active: i === index,
    label: strings.mediaCarousel.slideLabel(title, item.kind === 'image', i + 1, media.length),
    show: () => goTo(i),
  }))
  // Swiping or scrolling the track itself. Only where it rests on a slide, so the slides passed on the
  // way don't count (the count doesn't flicker back, and a video passed by isn't loaded); and not while
  // an arrow's scroll is on its way.
  const onScroll = () => {
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
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const next = Math.max(0, Math.min(media.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)))
      if (next !== index) trackEvent('Moved to another slide with the keyboard', { app: title, slide: `${next + 1} of ${media.length}` })
      goTo(next)
    }
  }
  if (slides.length === 0) return null

  return (
    <section className="carousel" aria-roledescription={strings.mediaCarousel.carousel} aria-label={strings.mediaCarousel.imagesVideos(title)}>
      <div ref={track} className="carousel-track" onScroll={onScroll} onKeyDown={onKeyDown} tabIndex={0} aria-label={strings.mediaCarousel.useArrowKeysMove}>
        {slides.map(({ key, position, ...slide }) => (
          <div key={key} className="carousel-slide" role="group" aria-roledescription={strings.mediaCarousel.slide} aria-label={position}>
            <MediaSlide {...slide} />
          </div>
        ))}
      </div>
      {media.length > 1 && (
        <CarouselControls
          dots={media.map((_, i) => ({ key: i, label: strings.mediaCarousel.show(i + 1, media.length), current: i === index, show: () => goTo(i) }))}
          count={`${index + 1} / ${media.length}`}
          canGoBack={index > 0}
          canGoOn={index < media.length - 1}
          previous={() => goTo(index - 1)}
          next={() => goTo(index + 1)}
        />
      )}
    </section>
  )
}
