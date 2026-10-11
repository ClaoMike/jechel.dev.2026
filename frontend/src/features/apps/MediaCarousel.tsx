import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowLeftIcon, ArrowRightIcon } from '../../components/icons'
import { PlayIcon } from '../../components/icons'
import type { AppMedia } from '../../services/api'
import { youTubeEmbedUrl, youTubeIdIn, youTubeThumbnail } from './media'

/**
 * Images and videos side by side, one at a time: swipe or scroll sideways, use the arrows or
 * dots, or the arrow keys. Moving away from a video pauses it; a YouTube video's player is only
 * loaded on its own slide (elsewhere it's a thumbnail), so moving away stops it too.
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
            <Slide item={item} index={i} active={i === index} label={`${title}, ${item.kind === 'image' ? 'image' : 'video'} ${i + 1} of ${media.length}`} onShow={() => goTo(i)} />
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

function Slide({ item, index, active, label, onShow }: { item: AppMedia; index: number; active: boolean; label: string; onShow: () => void }) {
  if (item.kind === 'image') return <img src={item.url} alt={label} loading={index === 0 ? 'eager' : 'lazy'} />
  if (item.kind === 'video') return <video src={item.url} data-index={index} controls preload="metadata" playsInline aria-label={label} />

  const id = youTubeIdIn(item.url)
  if (!id) return null
  return active ? (
    <iframe
      src={youTubeEmbedUrl(id)}
      title={label}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  ) : (
    <button type="button" className="carousel-youtube-thumb" aria-label={`Show ${label}`} onClick={onShow}>
      <img src={youTubeThumbnail(id)} alt="" loading="lazy" />
      <PlayIcon size={40} />
    </button>
  )
}
