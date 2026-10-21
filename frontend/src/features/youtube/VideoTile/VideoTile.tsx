import { MediaCard } from '../../../components/MediaCard'
import type { YouTubeVideo } from '../../../services/api'
import { useVideoTileViewModel } from './VideoTile.viewModel'

/** A video on the YouTube grid: thumbnail, title, date, the start of its description; opens it on YouTube. */
export function VideoTile(props: { item: YouTubeVideo }) {
  const { item } = props
  const vm = useVideoTileViewModel(props)
  return <MediaCard href={item.url} imageUrl={item.thumbnailUrl} title={item.title} description={item.description} meta={<time dateTime={vm.dateTime}>{vm.date}</time>} />
}
