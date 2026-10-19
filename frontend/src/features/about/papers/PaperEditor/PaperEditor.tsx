import { ItemControls, TextField } from '../../../../components/fields'
import { FileUpload } from '../../FileUpload/FileUpload'
import { usePaperEditorViewModel, type PaperEditorProps } from './PaperEditor.viewModel'

/** One paper: its title, and its PDF. */
export function PaperEditor(props: PaperEditorProps) {
  const { index, count, paper, titleError, fileError, onMove, onRemove } = props
  const vm = usePaperEditorViewModel(props)
  return (
    <fieldset className="editor-item">
      <legend>{vm.legend}</legend>
      <div className="editor-item-toolbar">
        <ItemControls name={vm.name} index={index} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      <TextField label="Title" value={paper.title} required multiline onChange={vm.setTitle} error={titleError} />
      <FileUpload
        label="PDF"
        context={vm.uploadContext}
        accept="application/pdf,.pdf"
        maxBytes={vm.maxBytes}
        hint="Up to 200 MB. With a PDF, the title becomes its download link."
        kind="paper"
        onUploaded={(file) => vm.uploaded(file.url)}
        onRemove={vm.removeFile}
        error={fileError}
      >
        <p className="upload-current">
          {vm.file ? (
            <a href={vm.file.href} target="_blank" rel="noopener noreferrer">
              {vm.file.name}
            </a>
          ) : (
            <span className="muted">No PDF: the title is shown without a link.</span>
          )}
        </p>
      </FileUpload>
    </fieldset>
  )
}
