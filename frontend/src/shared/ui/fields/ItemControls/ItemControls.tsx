import { DeleteButton } from '../../DeleteButton'
import { ArrowDownIcon, ArrowUpIcon } from '../../icons'
import { REMOVE_DETAIL } from '../editor'
import { strings } from '../../../i18n'

export interface ItemControlsProps {
  /** What the item is called in the buttons: "Move role 2 up", "Remove role 2". */
  name: string
  index: number
  count: number
  /** Leave out for a list that can't be reordered. */
  onMove?: (from: number, to: number) => void
  onRemove: () => void
}

/** Move up / move down / remove buttons for one item of an editable list. Removing asks first. */
export function ItemControls({ name, index, count, onMove, onRemove }: ItemControlsProps) {
  return (
    <div className="item-controls">
      {onMove && (
        <>
          <button
            type="button"
            className="icon-button"
            aria-label={strings.itemControls.moveUp(name)}
            title={strings.itemControls.moveUp2}
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
          >
            <ArrowUpIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={strings.itemControls.moveDown(name)}
            title={strings.itemControls.moveDown2}
            disabled={index === count - 1}
            onClick={() => onMove(index, index + 1)}
          >
            <ArrowDownIcon />
          </button>
        </>
      )}
      <DeleteButton what={name} action={strings.common.remove} detail={REMOVE_DETAIL} onDelete={onRemove} />
    </div>
  )
}
