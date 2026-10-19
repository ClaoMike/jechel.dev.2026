import type { Paper } from '../../../../services/api'
import { EditableSection } from '../../section/EditableSection/EditableSection'
import { PaperItem } from '../PaperItem/PaperItem'
import { PapersEditor } from '../PapersEditor/PapersEditor'
import { usePapersSectionViewModel } from './PapersSection.viewModel'

/** Academic papers: each title downloads its PDF, when one was uploaded. */
export function PapersSection({ value, canEdit, onSave }: { value: Paper[]; canEdit: boolean; onSave: (value: Paper[]) => Promise<void> }) {
  const vm = usePapersSectionViewModel(value)
  return (
    <EditableSection title="Academic papers" errorKeys={['papers']} value={value} canEdit={canEdit} onSave={onSave} editor={PapersEditor}>
      {vm.papers.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <ul className="papers">
          {vm.papers.map((paper, i) => (
            <PaperItem key={i} paper={paper} />
          ))}
        </ul>
      )}
    </EditableSection>
  )
}
