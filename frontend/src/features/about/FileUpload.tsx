import { useId, useRef, useState, type ReactNode } from 'react'
import { TrashIcon, UploadIcon } from '../../components/icons'
import { ApiError, type UploadedFile } from '../../services/api'

interface FileUploadProps {
  /** What the file is, e.g. "Photo": the legend, and the buttons' "Upload photo". */
  label: string
  /** Hidden words added to the buttons, to tell several uploads apart: "for paper 2". */
  context?: string
  accept: string
  hint: string
  upload: (file: File) => Promise<UploadedFile>
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
export function FileUpload({ label, context, accept, hint, upload, onUploaded, onRemove, error, children }: FileUploadProps) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<{ state: 'idle' } | { state: 'uploading' } | { state: 'failed'; message: string }>({ state: 'idle' })
  const message = status.state === 'failed' ? status.message : error
  // "Photo" → "photo", but an acronym like "PDF" stays as it is.
  const noun = label === label.toUpperCase() ? label : label.toLowerCase()
  const action = status.state === 'uploading' ? 'Uploading…' : onRemove ? `Replace ${noun}` : `Upload ${noun}`
  // With several uploads on one form, the buttons' names say which one: "Remove PDF for paper 2".
  const named = (text: string) => (context ? `${text} ${context}` : undefined)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setStatus({ state: 'uploading' })
    try {
      onUploaded(await upload(file))
      setStatus({ state: 'idle' })
    } catch (e) {
      const reason = e instanceof ApiError && e.validationErrors?.file?.[0]
      const expired = e instanceof ApiError && e.status === 401
      setStatus({ state: 'failed', message: reason || (expired ? 'Your session has ended. Sign in again, then upload.' : "Couldn't upload. Please try again.") })
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  return (
    <fieldset className="upload" aria-describedby={`${id}-hint${message ? ` ${id}-error` : ''}`}>
      <legend className="field-label">{label}</legend>
      {children}
      <div className="upload-actions">
        <input ref={input} id={id} type="file" accept={accept} className="visually-hidden" tabIndex={-1} onChange={(e) => void handleFile(e.target.files?.[0])} aria-label={`${label} file${context ? ` ${context}` : ''}`} />
        <button type="button" className="button button-secondary button-small" disabled={status.state === 'uploading'} onClick={() => input.current?.click()} aria-label={named(action)}>
          <UploadIcon size={16} />
          {action}
        </button>
        {onRemove && (
          <button type="button" className="button button-secondary button-small" disabled={status.state === 'uploading'} onClick={onRemove} aria-label={named(`Remove ${noun}`)}>
            <TrashIcon size={16} />
            Remove {noun}
          </button>
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
