import { MediaCard } from '@/shared/ui/MediaCard'
import type { AppDetails } from '@/shared/api'
import { plainText } from '@/shared/lib/format'
import { CategoryLabels } from '@/entities/app'
import { tileImage } from '@/entities/app'

export interface AppTileProps {
  item: AppDetails
  /** Clicking the tile: opens the app's popup. */
  onOpen: (app: AppDetails) => void
}

/**
 * An app on the Apps grid: picture (its first image, or a YouTube thumbnail), title, categories and the start of its
 * description without link markup; opens its popup.
 */
export function AppTile({ item, onOpen }: AppTileProps) {
  return (
    <MediaCard
      onClick={() => onOpen(item)}
      imageUrl={tileImage(item)}
      title={item.title}
      translateTitle={false}
      meta={item.categories.length > 0 && <CategoryLabels categories={item.categories} />}
      description={plainText(item.description)}
    />
  )
}
