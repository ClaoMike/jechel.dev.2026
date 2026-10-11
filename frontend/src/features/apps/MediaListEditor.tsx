import { useRef, useState } from 'react'
import { DeleteButton } from '../../components/DeleteButton'
import { GripIcon, PlayIcon, UploadIcon } from '../../components/icons'
import { useDragSort } from '../../components/useDragSort'
import { AddButton, TextField } from '../about/fields'
import { formatMegabytes } from '../about/format'
import { move, removeAt } from '../about/list'
import { APP_IMAGE_MAX_BYTES, APP_VIDEO_MAX_BYTES } from '../about/uploadLimits'
import { ApiError, api, type AppMedia } from '../../services/api'
import { mediaFromLink, youTubeIdIn, youTubeThumbnail } from './media'

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,.mov'

const noun = (item: AppMedia) => ({ image: 'image', video: 'video', youtube: 'YouTube video' })[item.kind]
const LABELS = { image: 'Image', video: 'Video', youtube: 'YouTube' }

/** Keys that stay the same when the list is reordered: the link, and which repeat of it this is. */
function stableKeys(items: AppMedia[]): string[] {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const n = seen.get(item.url) ?? 0
    seen.set(item.url, n + 1)
    return `${item.url}#${n}`
  })
}

/**
 * The app's images and videos, in order: drag them to reorder (or use the arrow keys on a
 * tile's handle), remove them, upload more (several at once) or add them from a link, such
 * as a YouTube trailer. Uploads go straight away; the list is saved with the app.
 */
export function MediaListEditor({ value, update, error }: { value: AppMedia[]; update: (change: (current: AppMedia[]) => AppMedia[]) => void; error?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const sort = useDragSort(value.length, (from, to) => update((current) => move(current, from, to)))
  const keys = stableKeys(value)

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

  function addLink() {
    const media = mediaFromLink(link)
    if (typeof media === 'string') {
      setLinkError(media)
      return
    }
    update((current) => [...current, media])
    setLink('')
    setLinkError(null)
  }

  return (
    <fieldset className="media-list-editor">
      <legend className="field-label">Images and videos</legend>
      <p className="field-hint">
        The first image is the tile's picture. Drag to reorder. Upload JPEG, PNG, WebP or GIF up to 15 MB and MP4, MOV or WebM up to 200 MB, or add a link: a YouTube video, or an image
        or video elsewhere.
      </p>
      {value.length > 0 && (
        <ol className={sort.dragging ? 'media-list media-list-dragging' : 'media-list'} aria-label="Images and videos">
          {sort.order.map((index, position) => {
            const item = value[index]
            const name = `${noun(item)} ${position + 1}`
            return (
              <li key={keys[index]} className="media-list-item" {...sort.itemProps(position)}>
                <MediaThumbnail item={item} />
                <span className="media-list-footer">
                  <button type="button" className="icon-button media-list-handle" {...sort.handleProps(position, name)}>
                    <GripIcon size={16} />
                  </button>
                  <span className="media-list-label">
                    {position + 1}. {LABELS[item.kind]}
                  </span>
                  <DeleteButton what={name} action="Remove" detail="It goes when you save the app; Cancel keeps it." onDelete={() => update((current) => removeAt(current, index))} />
                </span>
              </li>
            )
          })}
        </ol>
      )}
      <p className="visually-hidden" aria-live="polite">
        {sort.announcement}
      </p>
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
          {progress ?? 'Upload images or videos'}
        </button>
      </div>
      <div className="app-inline-add" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())}>
        <TextField label="Or add from a link" type="url" value={link} onChange={(next) => (setLink(next), setLinkError(null))} placeholder="https://www.youtube.com/watch?v=…" error={linkError ?? undefined} />
        <AddButton onClick={addLink}>Add link</AddButton>
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

function MediaThumbnail({ item }: { item: AppMedia }) {
  if (item.kind === 'image') return <img className="media-list-thumb" src={item.url} alt="" draggable={false} />
  const youTube = item.kind === 'youtube' ? youTubeIdIn(item.url) : null
  return (
    <span className="media-list-thumb media-list-video">
      {youTube ? <img src={youTubeThumbnail(youTube)} alt="" draggable={false} /> : <video src={item.url} muted preload="metadata" aria-hidden="true" />}
      <PlayIcon size={20} />
    </span>
  )
}
