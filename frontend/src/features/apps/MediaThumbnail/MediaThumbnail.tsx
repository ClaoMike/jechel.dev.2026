import { FittedImage } from '../../../components/FittedImage'
import { PlayIcon } from '../../../components/icons/icons'
import type { AppMedia } from '../../../services/api'
import { useMediaThumbnailViewModel } from './MediaThumbnail.viewModel'

/** A small picture of an image or video in the app's media list (videos with a play sign). */
export function MediaThumbnail(props: { item: AppMedia }) {
  const vm = useMediaThumbnailViewModel(props)
  if (vm.kind === 'image') return <FittedImage className="media-list-thumb" src={vm.src} alt="" />
  return (
    <span className="media-list-thumb media-list-video">
      {vm.kind === 'youtube' ? <img src={vm.src} alt="" draggable={false} /> : <video src={vm.src} muted preload="metadata" aria-hidden="true" />}
      <PlayIcon size={20} />
    </span>
  )
}
