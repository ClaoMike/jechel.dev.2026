import { useId, useRef, useState } from 'react'
import { api, failureOf, type UploadedFile } from '../../../services/api'
import { formatMegabytes } from '../format'

/** What's uploaded: a photo (stored as a small WebP) or a paper (a PDF). */
export type UploadKind = 'photo' | 'paper'

// Uploads go to the API service directly: their progress isn't the store's to keep.
const UPLOADS = { photo: api.files.uploadPhoto, paper: api.files.uploadPaper }

export interface FileUploadOptions {
  label: string
  context?: string
  maxBytes: number
  kind: UploadKind
  onUploaded: (file: UploadedFile) => void
  onRemove?: () => void
  error?: string
}

type Status = { state: 'idle' } | { state: 'uploading'; percent: number } | { state: 'failed'; message: string }

/** One file's upload: refused here if too big, then sent at once with its progress; the page only uses it once the section is saved. */
export function useFileUploadViewModel({ label, context, maxBytes, kind, onUploaded, onRemove, error }: FileUploadOptions) {
  const upload = UPLOADS[kind]
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>({ state: 'idle' })
  // "Photo" → "photo", but an acronym like "PDF" stays as it is.
  const noun = label === label.toUpperCase() ? label : label.toLowerCase()
  const action = status.state === 'uploading' ? `Uploading… ${status.percent}%` : onRemove ? `Replace ${noun}` : `Upload ${noun}`
  // With several uploads on one form, the buttons' names say which one: "Remove PDF for paper 2".
  const named = (text: string) => (context ? `${text} ${context}` : undefined)

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (file.size > maxBytes) {
      setStatus({ state: 'failed', message: `That file is ${formatMegabytes(file.size)}. The limit is ${formatMegabytes(maxBytes)}.` })
      if (input.current) input.current.value = ''
      return
    }
    setStatus({ state: 'uploading', percent: 0 })
    try {
      onUploaded(await upload(file, (fraction) => setStatus({ state: 'uploading', percent: Math.floor(fraction * 100) })))
      setStatus({ state: 'idle' })
    } catch (e) {
      const { status: code, validationErrors } = failureOf(e)
      const reason = validationErrors?.file?.[0]
      setStatus({ state: 'failed', message: reason || (code === 401 ? 'Your session has ended. Sign in again, then upload.' : "Couldn't upload. Please try again.") })
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  return {
    id: useId(),
    inputRef: input,
    noun,
    action,
    actionLabel: named(action),
    removeLabel: named(`Remove ${noun}`) ?? `Remove ${noun}`,
    removeWhat: context ? `the ${noun} ${context}` : `the ${noun}`,
    inputLabel: `${label} file${context ? ` ${context}` : ''}`,
    uploading: status.state === 'uploading',
    message: status.state === 'failed' ? status.message : error,
    pick: () => input.current?.click(),
    handleFile: (file: File | undefined) => void handleFile(file),
  }
}
