import { DeleteButton } from '../../../components/DeleteButton/DeleteButton'
import { GripIcon, UploadIcon } from '../../../components/icons/icons'
import { AddButton, TextField } from '../../../components/fields'
import { MediaThumbnail } from '../MediaThumbnail/MediaThumbnail'
import { useMediaListEditorViewModel, type MediaListEditorProps } from './MediaListEditor.viewModel'

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,.mov'

/**
 * The app's images and videos, in order: drag them to reorder (or use the arrow keys on a
 * tile's handle), remove them, upload more (several at once) or add them from a link, such
 * as a YouTube trailer. Uploads go straight away; the list is saved with the app.
 */
export function MediaListEditor(props: MediaListEditorProps) {
  const { inputRef, ...vm } = useMediaListEditorViewModel(props)
  const { sort } = vm

  return (
    <fieldset className="media-list-editor">
      <legend className="field-label">Images and videos</legend>
      <p className="field-hint">
        The first image is the tile's picture. Drag to reorder. Upload JPEG, PNG, WebP or GIF up to 15 MB and MP4, MOV or WebM up to 200 MB, or add a link: a YouTube video, or an image
        or video elsewhere.
      </p>
      {vm.items.length > 0 && (
        <ol className={sort.dragging ? 'media-list media-list-dragging' : 'media-list'} aria-label="Images and videos">
          {vm.items.map(({ key, position, item, name, label, remove }) => (
            <li key={key} className="media-list-item" {...sort.itemProps(position)}>
              <MediaThumbnail item={item} />
              <span className="media-list-footer">
                <button type="button" className="icon-button media-list-handle" {...sort.handleProps(position, name)}>
                  <GripIcon size={16} />
                </button>
                <span className="media-list-label">{label}</span>
                <DeleteButton what={name} action="Remove" detail="It goes when you save the app; Cancel keeps it." onDelete={remove} />
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
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Image or video files"
          onChange={(e) => vm.upload([...(e.target.files ?? [])])}
        />
        <button type="button" className="button button-secondary button-small" disabled={vm.progress !== null} onClick={vm.pickFiles}>
          <UploadIcon size={16} />
          {vm.progress ?? 'Upload images or videos'}
        </button>
        {/* The button says how far it got; this tells screen readers too. */}
        <span className="visually-hidden" role="status">
          {vm.progress}
        </span>
      </div>
      <div className="app-inline-add" onKeyDown={vm.onLinkKeyDown}>
        <TextField label="Or add from a link" type="url" value={vm.link} onChange={vm.setLink} placeholder="https://www.youtube.com/watch?v=…" error={vm.linkError ?? undefined} />
        <AddButton onClick={vm.addLink}>Add link</AddButton>
      </div>
      {vm.problems.map((problem) => (
        <p key={problem} className="field-error" role="alert">
          {problem}
        </p>
      ))}
      {props.error && <p className="field-error">{props.error}</p>}
    </fieldset>
  )
}
