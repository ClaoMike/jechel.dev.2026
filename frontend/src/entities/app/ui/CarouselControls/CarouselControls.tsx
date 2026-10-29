import { ArrowLeftIcon, ArrowRightIcon } from '@/shared/ui/icons'
import { strings } from '@/shared/i18n'

export interface CarouselControlsProps {
  dots: { key: number; label: string; current: boolean; show: () => void }[]
  /** "2 / 5", read out when it changes. */
  count: string
  canGoBack: boolean
  canGoOn: boolean
  previous: () => void
  next: () => void
}

/** Under the slides: previous, a dot per slide, where we are, next. */
export function CarouselControls({ dots, count, canGoBack, canGoOn, previous, next }: CarouselControlsProps) {
  return (
    <div className="carousel-controls">
      <button type="button" className="icon-button" aria-label={strings.carouselControls.previous} disabled={!canGoBack} onClick={previous}>
        <ArrowLeftIcon />
      </button>
      <div className="carousel-dots">
        {dots.map((dot) => (
          <button key={dot.key} type="button" className="carousel-dot" aria-label={dot.label} aria-current={dot.current ? 'true' : undefined} onClick={dot.show} />
        ))}
      </div>
      <span className="carousel-count" aria-live="polite">
        {count}
      </span>
      <button type="button" className="icon-button" aria-label={strings.carouselControls.next} disabled={!canGoOn} onClick={next}>
        <ArrowRightIcon />
      </button>
    </div>
  )
}
