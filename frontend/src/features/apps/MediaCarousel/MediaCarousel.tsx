import type { AppMedia } from '../../../services/api'
import { CarouselControls } from '../CarouselControls/CarouselControls'
import { MediaSlide } from '../MediaSlide/MediaSlide'
import { useMediaCarouselViewModel } from './MediaCarousel.viewModel'

/**
 * Images and videos side by side, one at a time: swipe or scroll sideways, use the arrows or
 * dots, or the arrow keys. Moving away from a video pauses it; a YouTube video's player is only
 * loaded on its own slide (elsewhere it's a thumbnail), so moving away stops it too.
 */
export function MediaCarousel(props: { media: AppMedia[]; title: string }) {
  const { trackRef, ...vm } = useMediaCarouselViewModel(props)
  if (vm.slides.length === 0) return null

  return (
    <section className="carousel" aria-roledescription="carousel" aria-label={vm.label}>
      <div ref={trackRef} className="carousel-track" onScroll={vm.onScroll} onKeyDown={vm.onKeyDown} tabIndex={0} aria-label="Use the arrow keys to move between slides">
        {vm.slides.map(({ key, position, ...slide }) => (
          <div key={key} className="carousel-slide" role="group" aria-roledescription="slide" aria-label={position}>
            <MediaSlide {...slide} />
          </div>
        ))}
      </div>
      {vm.controls && <CarouselControls {...vm.controls} />}
    </section>
  )
}
