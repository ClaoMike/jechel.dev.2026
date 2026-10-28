import type { Paper } from '../../../../services/api'
import { EditableSection } from '../../section/EditableSection/EditableSection'
import { PaperItem } from '../PaperItem/PaperItem'
import { PapersEditor } from '../PapersEditor/PapersEditor'
import { isSafeUrl } from '../../format'
import { plainText } from '../../textLinks'

/** Academic papers: each title downloads its PDF (the title as plain text), when one was uploaded; its rich title otherwise. */
export function PapersSection({ value, canEdit, onSave }: { value: Paper[]; canEdit: boolean; onSave: (value: Paper[]) => Promise<void> }) {
  const papers = value.map((paper) =>
    paper.fileUrl && isSafeUrl(paper.fileUrl)
      ? { kind: 'download' as const, href: paper.fileUrl, title: plainText(paper.title), label: `${plainText(paper.title)} (PDF)` }
      : { kind: 'text' as const, title: paper.title },
  )
  return (
    <EditableSection title="Academic papers" errorKeys={['papers']} value={value} canEdit={canEdit} onSave={onSave} editor={PapersEditor}>
      {papers.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <ul className="papers">
          {papers.map((paper, i) => (
            <PaperItem key={i} paper={paper} />
          ))}
        </ul>
      )}
    </EditableSection>
  )
}
