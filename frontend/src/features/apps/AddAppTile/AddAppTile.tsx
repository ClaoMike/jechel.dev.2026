import { PlusIcon } from '../../../components/icons/icons'

/** The admin's first tile in the Apps grid: opens an empty app popup. */
export function AddAppTile({ onAdd }: { onAdd: () => void }) {
  return (
    <button type="button" className="media-card add-tile" onClick={onAdd}>
      <PlusIcon size={40} />
      <span>Add an app</span>
    </button>
  )
}
