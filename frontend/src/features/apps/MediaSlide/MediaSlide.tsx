import { FittedImage } from '../../../components/FittedImage'
import { PlayIcon } from '../../../components/icons/icons'
import { YouTubePlayer } from '../../youtube/YouTubePlayer/YouTubePlayer'
import { useMediaSlideViewModel, type MediaSlideProps } from './MediaSlide.viewModel'

/** One slide: an image, a video, or a YouTube video (its player only while on show, its thumbnail otherwise). */
export function MediaSlide(props: MediaSlideProps) {
  const vm = useMediaSlideViewModel(props)
  switch (vm.kind) {
    case 'image':
      return <FittedImage src={vm.src} alt={vm.alt} loading={vm.loading} />
    case 'video':
      return <video src={vm.src} data-index={vm.index} controls preload="metadata" playsInline aria-label={vm.label} />
    case 'youtube':
      return <YouTubePlayer src={vm.src} title={vm.label} />
    case 'thumbnail':
      return (
        <button type="button" className="carousel-youtube-thumb" aria-label={vm.label} onClick={props.show}>
          <img src={vm.src} alt="" loading="lazy" />
          <PlayIcon size={40} />
        </button>
      )
    default:
      return null
  }
}
