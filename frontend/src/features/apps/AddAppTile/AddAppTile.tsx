import { PlusIcon } from '../../../components/icons/icons'
import { strings } from '../../../strings'

/** The admin's first tile in the Apps grid: opens an empty app popup. */
export function AddAppTile({ onAdd }: { onAdd: () => void }) {
  return (
    <button type="button" className="media-card add-tile" onClick={onAdd}>
      <PlusIcon size={40} />
      <span>{strings.addAppTile.addApp}</span>
    </button>
  )
}
