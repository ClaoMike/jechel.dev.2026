import { SortIcon } from '../../../../components/icons/icons'

export interface SortableListHeaderProps {
  /** What to know about the order, e.g. "Shown in this order. Move entries with the arrows, or sort them by year." */
  note: string
  /** The sort button: "Sort by year". */
  sortLabel: string
  /** Said once sorted: "Sorted by year, newest first. Save to keep this order, or Cancel to undo." */
  sortedMessage: string
  canSort: boolean
  sorted: boolean
  sort: () => void
}

/** Above a reorderable list: how the order works, a button that sorts it, and (read out) that it was sorted. */
export function SortableListHeader({ note, sortLabel, sortedMessage, canSort, sorted, sort }: SortableListHeaderProps) {
  return (
    <>
      <div className="editor-list-header">
        <p className="muted editor-note">{note}</p>
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
