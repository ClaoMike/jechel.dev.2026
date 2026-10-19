import { LinkIcon } from '../../icons/icons'
import { useLinkInserterViewModel, type LinkInserterProps } from './LinkInserter.viewModel'

/**
 * "Add link": asks for the link's text (the selected words, if any) and URL, then puts
 * [text](url) in place of the selection, or at the cursor.
 */
export function LinkInserter(props: LinkInserterProps) {
  const vm = useLinkInserterViewModel(props)
  const { draft } = vm

  if (!draft) {
    return (
      <button type="button" className="text-button" onClick={vm.open}>
        <LinkIcon size={14} />
        Add link <span className="visually-hidden">to {props.fieldLabel}</span>
      </button>
    )
  }

  return (
    <div className="link-inserter" role="group" aria-label={vm.groupLabel}>
      <div className="field">
        <label htmlFor={vm.labelId}>Link text</label>
        <input id={vm.labelId} value={draft.label} onChange={(e) => vm.setLabel(e.target.value)} onKeyDown={vm.onKeyDown} placeholder="The University of Manchester" />
      </div>
      <div className="field">
        <label htmlFor={vm.urlId}>Link URL</label>
        <input
          id={vm.urlId}
          type="url"
          value={draft.url}
          autoFocus
          aria-invalid={draft.error ? true : undefined}
          aria-describedby={draft.error ? vm.errorId : undefined}
          onChange={(e) => vm.setUrl(e.target.value)}
          onKeyDown={vm.onKeyDown}
        />
      </div>
      <div className="link-inserter-actions">
        <button type="button" className="button button-small" onClick={vm.insert}>
          Insert link
        </button>
        <button type="button" className="button button-secondary button-small" onClick={vm.cancel}>
          Cancel
        </button>
      </div>
      {draft.error && (
        <p className="field-error" id={vm.errorId}>
          {draft.error}
        </p>
      )}
    </div>
  )
}
