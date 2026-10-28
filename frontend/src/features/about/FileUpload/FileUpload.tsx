import { useId, useRef, useState, type ReactNode } from 'react'
import { DeleteButton } from '../../../components/DeleteButton/DeleteButton'
import { REMOVE_DETAIL } from '../../../components/fields'
import { TrashIcon, UploadIcon } from '../../../components/icons/icons'
import { api, failureOf, type UploadedFile } from '../../../services/api'
import { formatMegabytes } from '../format'
import { strings } from '../../../strings'

/** What's uploaded: a photo (stored as a small WebP) or a paper (a PDF). */
type UploadKind = 'photo' | 'paper'

// Uploads go to the API service directly: their progress isn't the store's to keep.
const upload = (kind: UploadKind, file: File, onProgress: (fraction: number) => void) =>
  kind === 'photo' ? api.files.uploadPhoto(file, onProgress) : api.files.uploadPaper(file, onProgress)

type Status = { state: 'idle' } | { state: 'uploading'; percent: number } | { state: 'failed'; message: string }

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
 * Upload / Replace and Remove buttons for one file. The file is refused here if it's too big, otherwise uploaded straight
 * away with its progress, but the page only uses it once the section is saved.
 */
export function FileUpload({ label, context, accept, maxBytes, hint, kind, onUploaded, onRemove, error, children }: FileUploadProps) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>({ state: 'idle' })
  // "Photo" → "photo", but an acronym like "PDF" stays as it is.
  const noun = label === label.toUpperCase() ? label : label.toLowerCase()
  const action = status.state === 'uploading' ? strings.fileUpload.uploading(status.percent) : onRemove ? strings.fileUpload.replace(noun) : strings.fileUpload.upload(noun)
  // With several uploads on one form, the buttons' names say which one: "Remove PDF for paper 2".
  const named = (text: string) => (context ? `${text} ${context}` : undefined)
  const uploading = status.state === 'uploading'
  const message = status.state === 'failed' ? status.message : error

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (file.size > maxBytes) {
      setStatus({ state: 'failed', message: strings.fileUpload.fileLimit(formatMegabytes(file.size), formatMegabytes(maxBytes)) })
      if (input.current) input.current.value = ''
      return
    }
    setStatus({ state: 'uploading', percent: 0 })
    try {
      onUploaded(await upload(kind, file, (fraction) => setStatus({ state: 'uploading', percent: Math.floor(fraction * 100) })))
      setStatus({ state: 'idle' })
    } catch (e) {
      const { status: code, validationErrors } = failureOf(e)
      const reason = validationErrors?.file?.[0]
      setStatus({ state: 'failed', message: reason || (code === 401 ? strings.fileUpload.sessionHasEndedSign : strings.fileUpload.couldntUploadPleaseTry) })
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  return (
    <fieldset className="upload" aria-describedby={`${id}-hint${message ? ` ${id}-error` : ''}`}>
      <legend className="field-label">{label}</legend>
      {children}
      <div className="upload-actions">
        <input
          ref={input}
          id={id}
          type="file"
          accept={accept}
          className="visually-hidden"
          tabIndex={-1}
          onChange={(e) => void handleFile(e.target.files?.[0])}
          aria-label={strings.fileUpload.file(label, context ? ` ${context}` : '')}
        />
        <button type="button" className="button button-secondary button-small" disabled={uploading} onClick={() => input.current?.click()} aria-label={named(action)}>
          <UploadIcon size={16} />
          {action}
        </button>
        {onRemove && (
          <DeleteButton
            what={context ? strings.fileUpload.the(noun, context) : strings.fileUpload.the2(noun)}
            action={strings.common.remove}
            detail={REMOVE_DETAIL}
            onDelete={onRemove}
            className="button button-secondary button-small"
            disabled={uploading}
            label={named(strings.fileUpload.remove2(noun)) ?? strings.fileUpload.remove2(noun)}
          >
            <TrashIcon size={16} />
            {strings.fileUpload.remove3}
            {noun}
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
