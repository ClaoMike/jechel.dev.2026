import type { Qualification } from '../../../../services/api'
import { EditableSection } from '../../section/EditableSection/EditableSection'
import { QualificationItem } from '../QualificationItem/QualificationItem'
import { QualificationsEditor } from '../QualificationsEditor/QualificationsEditor'
import { useQualificationsSectionViewModel } from './QualificationsSection.viewModel'

/** Certifications and the like: what, who issued it, when, and the grade if there was one. */
export function QualificationsSection({ value, canEdit, onSave }: { value: Qualification[]; canEdit: boolean; onSave: (value: Qualification[]) => Promise<void> }) {
  const vm = useQualificationsSectionViewModel(value)
  return (
    <EditableSection title="Qualifications" errorKeys={['qualifications']} value={value} canEdit={canEdit} onSave={onSave} editor={QualificationsEditor}>
      {vm.items.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <ul className="qualifications">
          {vm.items.map((item, i) => (
            <QualificationItem key={i} item={item} />
          ))}
        </ul>
      )}
    </EditableSection>
  )
}
