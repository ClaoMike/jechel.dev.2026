import type { AppDetails } from '../../../services/api'
import { plainText } from '../../about/textLinks'
import { tileImage } from '../media'

export interface AppTileProps {
  item: AppDetails
  /** Clicking the tile: opens the app's popup. */
  onOpen: (app: AppDetails) => void
}

/** The tile's picture (its first image, or a YouTube thumbnail), and its description without link markup. */
export function useAppTileViewModel({ item, onOpen }: AppTileProps) {
  return {
    imageUrl: tileImage(item),
    title: item.title,
    categories: item.categories,
    description: plainText(item.description),
    open: () => onOpen(item),
  }
}
