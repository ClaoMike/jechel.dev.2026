import { useRef, useState } from 'react'
import { DeleteButton } from '../../components/DeleteButton'
import { ArrowLeftIcon, ArrowRightIcon, PlayIcon, UploadIcon } from '../../components/icons'
import { formatMegabytes } from '../about/format'
import { move, removeAt } from '../about/list'
import { APP_IMAGE_MAX_BYTES, APP_VIDEO_MAX_BYTES } from '../about/uploadLimits'
import { ApiError, api, type AppMedia } from '../../services/api'

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,.mov'

const noun = (item: AppMedia) => (item.kind === 'video' ? 'video' : 'image')

/**
 * The app's images and videos, in order: move them left or right, remove them, or add more
 * (several at once). Uploads go straight away; the list is saved with the app.
 */
export function MediaListEditor({ value, update, error }: { value: AppMedia[]; update: (change: (current: AppMedia[]) => AppMedia[]) => void; error?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])

  async function upload(files: File[]) {
    const failed: string[] = []
    for (const [i, file] of files.entries()) {
      const max = file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mov') ? APP_VIDEO_MAX_BYTES : APP_IMAGE_MAX_BYTES
      if (file.size > max) {
        failed.push(`${file.name} is ${formatMegabytes(file.size)}; the limit is ${formatMegabytes(max)}.`)
        continue
      }
      const label = files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : 'Uploading…'
      setProgress(`${label} 0%`)
      try {
        const uploaded = await api.files.uploadAppMedia(file, (fraction) => setProgress(`${label} ${Math.floor(fraction * 100)}%`))
        // Appends to the latest list: other changes may have happened while this uploaded.
        update((current) => [...current, { url: uploaded.url, kind: uploaded.kind }])
      } catch (e) {
        const reason = e instanceof ApiError && e.validationErrors?.file?.[0]
        const expired = e instanceof ApiError && e.status === 401
        failed.push(`${file.name}: ${reason || (expired ? 'your session has ended. Sign in again, then upload.' : "couldn't upload. Please try again.")}`)
      }
    }
    setProgress(null)
    setProblems(failed)
    if (input.current) input.current.value = ''
  }

  return (
    <fieldset className="media-list-editor">
      <legend className="field-label">Images and videos</legend>
      <p className="field-hint">The first image is the tile's picture. JPEG, PNG, WebP or GIF up to 15 MB; MP4, MOV or WebM up to 200 MB.</p>
      {value.length > 0 && (
        <ol className="media-list" aria-label="Images and videos">
          {value.map((item, i) => {
            const name = `${noun(item)} ${i + 1}`
            return (
              <li key={`${item.url}-${i}`} className="media-list-item">
                {item.kind === 'video' ? (
                  <span className="media-list-thumb media-list-video">
                    <video src={item.url} muted preload="metadata" aria-hidden="true" />
                    <PlayIcon size={20} />
                  </span>
                ) : (
                  <img className="media-list-thumb" src={item.url} alt="" />
                )}
                <span className="media-list-label">
                  {i + 1}. {noun(item) === 'video' ? 'Video' : 'Image'}
                </span>
                <span className="media-list-controls">
                  <button type="button" className="icon-button" aria-label={`Move ${name} left`} title="Move left" disabled={i === 0} onClick={() => update((current) => move(current, i, i - 1))}>
                    <ArrowLeftIcon size={16} />
                  </button>
                  <button type="button" className="icon-button" aria-label={`Move ${name} right`} title="Move right" disabled={i === value.length - 1} onClick={() => update((current) => move(current, i, i + 1))}>
                    <ArrowRightIcon size={16} />
                  </button>
                  <DeleteButton what={name} action="Remove" detail="It goes when you save the app; Cancel keeps it." onDelete={() => update((current) => removeAt(current, i))} />
                </span>
              </li>
            )
          })}
        </ol>
      )}
      <div className="upload-actions">
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Image or video files"
          onChange={(e) => void upload([...(e.target.files ?? [])])}
        />
        <button type="button" className="button button-secondary button-small" disabled={progress !== null} onClick={() => input.current?.click()}>
          <UploadIcon size={16} />
          {progress ?? 'Add images or videos'}
        </button>
      </div>
      {problems.map((problem) => (
        <p key={problem} className="field-error" role="alert">
          {problem}
        </p>
      ))}
      {error && <p className="field-error">{error}</p>}
    </fieldset>
  )
}
