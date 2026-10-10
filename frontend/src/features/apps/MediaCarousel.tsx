import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowLeftIcon, ArrowRightIcon } from '../../components/icons'
import type { AppMedia } from '../../services/api'

/**
 * Images and videos side by side, one at a time: swipe or scroll sideways, use the arrows or
 * dots, or the arrow keys. Moving away from a video pauses it.
 */
export function MediaCarousel({ media, title }: { media: AppMedia[]; title: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    track.current?.querySelectorAll('video').forEach((video) => {
      if (Number(video.dataset.index) !== index && !video.paused) video.pause()
    })
  }, [index])

  if (media.length === 0) return null

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(media.length - 1, next))
    const el = track.current
    el?.scrollTo?.({ left: clamped * el.clientWidth, behavior: 'smooth' })
    setIndex(clamped)
  }

  // Swiping or scrolling the track itself.
  const onScroll = () => {
    const el = track.current
    if (el && el.clientWidth > 0) setIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      goTo(index + (event.key === 'ArrowLeft' ? -1 : 1))
    }
  }

  return (
    <section className="carousel" aria-roledescription="carousel" aria-label={`${title}: images and videos`}>
      <div ref={track} className="carousel-track" onScroll={onScroll} onKeyDown={onKeyDown} tabIndex={0} aria-label="Use the arrow keys to move between slides">
        {media.map((item, i) => (
          <div key={`${item.url}-${i}`} className="carousel-slide" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${media.length}`}>
            {item.kind === 'video' ? (
              <video src={item.url} data-index={i} controls preload="metadata" playsInline aria-label={`${title}, video ${i + 1} of ${media.length}`} />
            ) : (
              <img src={item.url} alt={`${title}, image ${i + 1} of ${media.length}`} loading={i === 0 ? 'eager' : 'lazy'} />
            )}
          </div>
        ))}
      </div>
      {media.length > 1 && (
        <div className="carousel-controls">
          <button type="button" className="icon-button" aria-label="Previous" disabled={index === 0} onClick={() => goTo(index - 1)}>
            <ArrowLeftIcon />
          </button>
          <div className="carousel-dots">
            {media.map((_, i) => (
              <button key={i} type="button" className="carousel-dot" aria-label={`Show ${i + 1} of ${media.length}`} aria-current={i === index ? 'true' : undefined} onClick={() => goTo(i)} />
            ))}
          </div>
          <span className="carousel-count" aria-live="polite">
            {index + 1} / {media.length}
          </span>
          <button type="button" className="icon-button" aria-label="Next" disabled={index === media.length - 1} onClick={() => goTo(index + 1)}>
            <ArrowRightIcon />
          </button>
        </div>
      )}
    </section>
  )
}
