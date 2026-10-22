import { SortIcon } from '../../../../components/icons/icons'

export interface SortableListHeaderProps {
  /** The sort button: "Sort by year". */
  sortLabel: string
  /** Said once sorted: "Sorted by year, newest first. Save to keep this order, or Cancel to undo." */
  sortedMessage: string
  canSort: boolean
  sorted: boolean
  sort: () => void
}

/** Above a reorderable list: a button that sorts it, and (read out) that it was sorted. */
export function SortableListHeader({ sortLabel, sortedMessage, canSort, sorted, sort }: SortableListHeaderProps) {
  return (
    <>
      <div className="editor-list-header">
        <button type="button" className="button button-secondary button-small" disabled={!canSort} onClick={sort}>
          <SortIcon size={16} />
          {sortLabel}
        </button>
      </div>
      <p role="status" className={sorted ? 'editor-status' : 'visually-hidden'}>
        {sorted ? sortedMessage : ''}
      </p>
    </>
  )
}
