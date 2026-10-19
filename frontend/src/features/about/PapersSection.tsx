import { DownloadIcon } from '../../components/icons/icons'
import type { Paper } from '../../services/api'
import { EditableSection } from './EditableSection/EditableSection'
import { AddButton, ItemControls, TextField, type EditorProps } from './fields/fields'
import { FileUpload } from './FileUpload/FileUpload'
import { fileNameOf, isSafeUrl } from './format'
import { move, removeAt, replaceAt } from './list'
import { RichText } from './RichText'
import { plainText } from './textLinks'
import { PAPER_MAX_BYTES } from './uploadLimits'

/** Academic papers: each title downloads its PDF, when one was uploaded. */
export function PapersSection({ value, canEdit, onSave }: { value: Paper[]; canEdit: boolean; onSave: (value: Paper[]) => Promise<void> }) {
  return (
    <EditableSection title="Academic papers" errorKeys={['papers']} value={value} canEdit={canEdit} onSave={onSave} editor={PapersEditor}>
      {value.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <ul className="papers">
          {value.map((paper, i) => (
            <li key={i}>
              {paper.fileUrl && isSafeUrl(paper.fileUrl) ? (
                // The whole title is the link, so links inside it are shown as plain text.
                <a className="paper-download" href={paper.fileUrl} download aria-label={`${plainText(paper.title)} (PDF)`}>
                  <DownloadIcon size={16} />
                  <span>{plainText(paper.title)}</span>
                </a>
              ) : (
                <RichText text={paper.title} />
              )}
            </li>
          ))}
        </ul>
      )}
    </EditableSection>
  )
}

function PapersEditor({ value, onChange, update, errors }: EditorProps<Paper[]>) {
  return (
    <div className="editor-list">
      {value.map((paper, i) => {
        const set = (patch: Partial<Paper>) => onChange(replaceAt(value, i, { ...paper, ...patch }))
        // Uploads finish later: change the latest list, not the one the upload started from.
        const setFile = (fileUrl: string) => update((current) => current.map((p, j) => (j === i ? { ...p, fileUrl } : p)))
        return (
          <fieldset key={i} className="editor-item">
            <legend>Paper {i + 1}</legend>
            <div className="editor-item-toolbar">
              <ItemControls name={`paper ${i + 1}`} index={i} count={value.length} onMove={(from, to) => onChange(move(value, from, to))} onRemove={() => onChange(removeAt(value, i))} />
            </div>
            <TextField label="Title" value={paper.title} required multiline onChange={(title) => set({ title })} error={errors[`papers[${i}].title`]} />
            <FileUpload
              label="PDF"
              context={`for paper ${i + 1}`}
              accept="application/pdf,.pdf"
              maxBytes={PAPER_MAX_BYTES}
              hint="Up to 200 MB. With a PDF, the title becomes its download link."
              kind="paper"
              onUploaded={(file) => setFile(file.url)}
              onRemove={paper.fileUrl ? () => setFile('') : undefined}
              error={errors[`papers[${i}].fileUrl`]}
            >
              <p className="upload-current">
                {paper.fileUrl && isSafeUrl(paper.fileUrl) ? (
                  <a href={paper.fileUrl} target="_blank" rel="noopener noreferrer">
                    {fileNameOf(paper.fileUrl)}
                  </a>
                ) : (
                  <span className="muted">No PDF: the title is shown without a link.</span>
                )}
              </p>
            </FileUpload>
          </fieldset>
        )
      })}
      {errors.papers && <p className="field-error">{errors.papers}</p>}
      <AddButton onClick={() => onChange([...value, { title: '', fileUrl: '' }])}>Add paper</AddButton>
    </div>
  )
}
