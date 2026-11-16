import { MediaCard } from '@/shared/ui/MediaCard'
import type { YouTubeVideo } from '@/shared/api'
import { formatDate } from '@/shared/lib/format'

/** A video on the YouTube grid: thumbnail, title, date, the start of its description; opens it on YouTube. */
export function VideoTile(props: { item: YouTubeVideo }) {
  const { item } = props
  return (
    <MediaCard
      href={item.url}
      imageUrl={item.thumbnailUrl}
      title={item.title}
      description={item.description}
      meta={<time dateTime={item.publishedAt}>{formatDate(item.publishedAt)}</time>}
    />
  )
}
