import { MediaCard } from '../../../components/MediaCard'
import { CategoryLabels } from '../CategoryLabels/CategoryLabels'
import { useAppTileViewModel, type AppTileProps } from './AppTile.viewModel'

/** An app on the Apps grid: picture, title, categories and the start of its description; opens its popup. */
export function AppTile(props: AppTileProps) {
  const vm = useAppTileViewModel(props)
  return (
    <MediaCard
      onClick={vm.open}
      imageUrl={vm.imageUrl}
      title={vm.title}
      meta={vm.categories.length > 0 && <CategoryLabels categories={vm.categories} />}
      description={vm.description}
    />
  )
}
