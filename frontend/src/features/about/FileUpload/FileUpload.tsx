import type { ReactNode } from 'react'
import { DeleteButton } from '../../../components/DeleteButton/DeleteButton'
import { TrashIcon, UploadIcon } from '../../../components/icons/icons'
import type { UploadedFile } from '../../../services/api'
import { REMOVE_DETAIL } from '../../../components/fields'
import { useFileUploadViewModel, type UploadKind } from './FileUpload.viewModel'

interface FileUploadProps {
  /** What the file is, e.g. "Photo": the legend, and the buttons' "Upload photo". */
  label: string
  /** Hidden words added to the buttons, to tell several uploads apart: "for paper 2". */
  context?: string
  accept: string
  /** Bigger files are refused here, before they're sent. Same limit as the API's. */
  maxBytes: number
  hint: string
  /** Which upload it is (photo or paper). */
  kind: UploadKind
  onUploaded: (file: UploadedFile) => void
  /** Absent when there's nothing to remove. */
  onRemove?: () => void
  error?: string
  /** What's there now: the photo, or the résumé's name. */
  children: ReactNode
}

/**
 * Upload / Replace and Remove buttons for one file. The file is uploaded straight away, but
 * the page only uses it once the section is saved.
 */
export function FileUpload(props: FileUploadProps) {
  const { label, accept, hint, onRemove, children } = props
  const { inputRef, ...vm } = useFileUploadViewModel(props)
  const { id, message, noun } = vm

  return (
    <fieldset className="upload" aria-describedby={`${id}-hint${message ? ` ${id}-error` : ''}`}>
      <legend className="field-label">{label}</legend>
      {children}
      <div className="upload-actions">
        <input ref={inputRef} id={id} type="file" accept={accept} className="visually-hidden" tabIndex={-1} onChange={(e) => vm.handleFile(e.target.files?.[0])} aria-label={vm.inputLabel} />
        <button type="button" className="button button-secondary button-small" disabled={vm.uploading} onClick={vm.pick} aria-label={vm.actionLabel}>
          <UploadIcon size={16} />
          {vm.action}
        </button>
        {onRemove && (
          <DeleteButton
            what={vm.removeWhat}
            action="Remove"
            detail={REMOVE_DETAIL}
            onDelete={onRemove}
            className="button button-secondary button-small"
            disabled={vm.uploading}
            label={vm.removeLabel}
          >
            <TrashIcon size={16} />
            Remove {noun}
          </DeleteButton>
        )}
      </div>
      <p className="field-hint" id={`${id}-hint`}>
        {hint}
      </p>
      {message && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {message}
        </p>
      )}
    </fieldset>
  )
}
