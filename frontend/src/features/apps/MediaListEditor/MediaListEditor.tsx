import { useRef, useState, type KeyboardEvent } from 'react'
import { DeleteButton } from '../../../components/DeleteButton/DeleteButton'
import { GripIcon, UploadIcon } from '../../../components/icons/icons'
import { AddButton, TextField } from '../../../components/fields'
import { MediaThumbnail } from '../MediaThumbnail/MediaThumbnail'
import { useDragSort } from '../../../components/useDragSort'
import { api, failureOf, type AppMedia } from '../../../services/api'
import { formatMegabytes } from '../../about/format'
import { move, removeAt } from '../../about/list'
import { APP_IMAGE_MAX_BYTES, APP_VIDEO_MAX_BYTES } from '../../about/uploadLimits'
import { isVideoFile, mediaFromLink } from '../media'
import { strings } from '../../../strings'

const noun = (item: AppMedia) => ({ image: 'image', video: 'video', youtube: strings.mediaListEditor.youtubeVideo })[item.kind]
const LABELS = { image: strings.mediaListEditor.image, video: strings.mediaListEditor.video, youtube: 'YouTube' }

/** Keys that stay the same when the list is reordered: the link, and which repeat of it this is. */
function stableKeys(items: AppMedia[]): string[] {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const n = seen.get(item.url) ?? 0
    seen.set(item.url, n + 1)
    return `${item.url}#${n}`
  })
}

export interface MediaListEditorProps {
  value: AppMedia[]
  update: (change: (current: AppMedia[]) => AppMedia[]) => void
  error?: string
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,.mov'

/**
 * The app's images and videos, in order: drag them to reorder (or use the arrow keys on a
 * tile's handle), remove them, upload more (several at once) or add them from a link, such
 * as a YouTube trailer. Uploads go straight away; the list is saved with the app.
 */
export function MediaListEditor(props: MediaListEditorProps) {
  // The list in its shown order (dragging reorders it), uploads (several at once, straight away; the list is saved with
  // the app) and adding from a link.
  const { value, update } = props
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const sort = useDragSort(value.length, (from, to) => update((current) => move(current, from, to)))
  const keys = stableKeys(value)

  // Uploads go through the API service directly: their progress isn't the store's to keep.
  async function upload(files: File[]) {
    const failed: string[] = []
    for (const [i, file] of files.entries()) {
      const max = isVideoFile(file) ? APP_VIDEO_MAX_BYTES : APP_IMAGE_MAX_BYTES
      if (file.size > max) {
        failed.push(strings.mediaListEditor.limit(file.name, formatMegabytes(file.size), formatMegabytes(max)))
        continue
      }
      const label = files.length > 1 ? strings.mediaListEditor.uploading(i + 1, files.length) : strings.mediaListEditor.uploading2
      setProgress(`${label} 0%`)
      try {
        const uploaded = await api.files.uploadAppMedia(file, (fraction) => setProgress(`${label} ${Math.floor(fraction * 100)}%`))
        // Appends to the latest list: other changes may have happened while this uploaded.
        update((current) => [...current, { url: uploaded.url, kind: uploaded.kind }])
      } catch (e) {
        const { status, validationErrors } = failureOf(e)
        const reason = validationErrors?.file?.[0]
        failed.push(`${file.name}: ${reason || (status === 401 ? strings.mediaListEditor.sessionHasEndedSign : strings.mediaListEditor.couldntUploadPleaseTry)}`)
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
  const items = sort.order.map((index, position) => {
    const item = value[index]
    return {
      key: keys[index],
      position,
      item,
      name: `${noun(item)} ${position + 1}`,
      label: `${position + 1}. ${LABELS[item.kind]}`,
      remove: () => update((current) => removeAt(current, index)),
    }
  })
  const pickFiles = () => input.current?.click()
  // Enter adds the link instead of submitting the app's form.
  const onLinkKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addLink()
    }
  }

  return (
    <fieldset className="media-list-editor">
      <legend className="field-label">{strings.mediaListEditor.imagesVideos}</legend>
      <p className="field-hint">{strings.mediaListEditor.firstImageTilesPicture}</p>
      {items.length > 0 && (
        <ol className={sort.dragging ? 'media-list media-list-dragging' : 'media-list'} aria-label={strings.mediaListEditor.imagesVideos}>
          {items.map(({ key, position, item, name, label, remove }) => (
            <li key={key} className="media-list-item" {...sort.itemProps(position)}>
              <MediaThumbnail item={item} />
              <span className="media-list-footer">
                <button type="button" className="icon-button media-list-handle" {...sort.handleProps(position, name)}>
                  <GripIcon size={16} />
                </button>
                <span className="media-list-label">{label}</span>
                <DeleteButton what={name} action={strings.common.remove} detail={strings.mediaListEditor.goesWhenSaveApp} onDelete={remove} />
              </span>
            </li>
          ))}
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
          aria-label={strings.mediaListEditor.imageVideoFiles}
          onChange={(e) => upload([...(e.target.files ?? [])])}
        />
        <button type="button" className="button button-secondary button-small" disabled={progress !== null} onClick={pickFiles}>
          <UploadIcon size={16} />
          {progress ?? strings.mediaListEditor.uploadImagesVideos}
        </button>
        {/* The button says how far it got; this tells screen readers too. */}
        <span className="visually-hidden" role="status">
          {progress}
        </span>
      </div>
      <div className="app-inline-add" onKeyDown={onLinkKeyDown}>
        <TextField
          label={strings.mediaListEditor.addLink}
          type="url"
          value={link}
          onChange={(next) => {
            setLink(next)
            setLinkError(null)
          }}
          placeholder={strings.mediaListEditor.httpsWwwYoutubeCom}
          error={linkError ?? undefined}
        />
        <AddButton onClick={addLink}>{strings.mediaListEditor.addLink2}</AddButton>
      </div>
      {problems.map((problem) => (
        <p key={problem} className="field-error" role="alert">
          {problem}
        </p>
      ))}
      {props.error && <p className="field-error">{props.error}</p>}
    </fieldset>
  )
}
