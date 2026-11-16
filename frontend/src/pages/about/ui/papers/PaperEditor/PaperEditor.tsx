import { ItemControls, TextField } from '@/shared/ui/fields'
import type { Paper } from '@/shared/api'
import { FileUpload } from '../../FileUpload/FileUpload'
import { fileNameOf, isSafeUrl } from '@/shared/lib/format'
import { PAPER_MAX_BYTES } from '@/shared/lib/forms'
import { strings } from '@/shared/i18n'

export interface PaperEditorProps {
  index: number
  count: number
  paper: Paper
  titleError?: string
  fileError?: string
  onChange: (paper: Paper) => void
  setFile: (fileUrl: string) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

/** One paper: its title, and its PDF (uploaded, replaced or removed). */
export function PaperEditor({ index, count, paper, titleError, fileError, onChange, setFile, onMove, onRemove }: PaperEditorProps) {
  const file = paper.fileUrl && isSafeUrl(paper.fileUrl) ? { href: paper.fileUrl, name: fileNameOf(paper.fileUrl) } : null
  return (
    <fieldset className="editor-item">
      <legend>
        {strings.paperEditor.paper}
        {index + 1}
      </legend>
      <div className="editor-item-toolbar">
        <ItemControls name={`paper ${index + 1}`} index={index} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      <TextField label={strings.common.title} value={paper.title} required multiline onChange={(title) => onChange({ ...paper, title })} error={titleError} />
      <FileUpload
        label={strings.paperEditor.pdf}
        context={strings.paperEditor.paper2(index + 1)}
        accept="application/pdf,.pdf"
        maxBytes={PAPER_MAX_BYTES}
        hint={strings.paperEditor.up200MbPdf}
        kind="paper"
        onUploaded={(uploaded) => setFile(uploaded.url)}
        onRemove={paper.fileUrl ? () => setFile('') : undefined}
        error={fileError}
      >
        <p className="upload-current">
          {file ? (
            <a href={file.href} target="_blank" rel="noopener noreferrer">
              {file.name}
            </a>
          ) : (
            <span className="muted">{strings.paperEditor.noPdfTitleShown}</span>
          )}
        </p>
      </FileUpload>
    </fieldset>
  )
}
