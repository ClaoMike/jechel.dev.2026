import { ItemControls, TextField } from '../../../../components/fields'
import type { Paper } from '../../../../services/api'
import { FileUpload } from '../../FileUpload/FileUpload'
import { fileNameOf, isSafeUrl } from '../../format'
import { PAPER_MAX_BYTES } from '../../uploadLimits'

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
      <legend>Paper {index + 1}</legend>
      <div className="editor-item-toolbar">
        <ItemControls name={`paper ${index + 1}`} index={index} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      <TextField label="Title" value={paper.title} required multiline onChange={(title) => onChange({ ...paper, title })} error={titleError} />
      <FileUpload
        label="PDF"
        context={`for paper ${index + 1}`}
        accept="application/pdf,.pdf"
        maxBytes={PAPER_MAX_BYTES}
        hint="Up to 200 MB. With a PDF, the title becomes its download link."
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
            <span className="muted">No PDF: the title is shown without a link.</span>
          )}
        </p>
      </FileUpload>
    </fieldset>
  )
}
