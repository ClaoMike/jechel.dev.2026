import type { Paper } from '@/shared/api'
import { EditableSection } from '../../section/EditableSection/EditableSection'
import { PaperItem } from '../PaperItem/PaperItem'
import { PapersEditor } from '../PapersEditor/PapersEditor'
import { isSafeUrl } from '@/shared/lib/format'
import { plainText } from '@/shared/lib/format'
import { strings } from '@/shared/i18n'

/** Academic papers: each title downloads its PDF (the title as plain text), when one was uploaded; its rich title otherwise. */
export function PapersSection({ value, canEdit, onSave }: { value: Paper[]; canEdit: boolean; onSave: (value: Paper[]) => Promise<void> }) {
  const papers = value.map((paper) =>
    paper.fileUrl && isSafeUrl(paper.fileUrl)
      ? { kind: 'download' as const, href: paper.fileUrl, title: plainText(paper.title), label: strings.papersSection.pdf(plainText(paper.title)) }
      : { kind: 'text' as const, title: paper.title },
  )
  return (
    <EditableSection title={strings.common.academicPapers} errorKeys={['papers']} value={value} canEdit={canEdit} onSave={onSave} editor={PapersEditor}>
      {papers.length === 0 ? (
        <p className="muted">{strings.common.nothingHereYet}</p>
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
