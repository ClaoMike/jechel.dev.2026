import { LICENCE_CATEGORIES, type Licence } from '@/shared/api'
import { EditableSection } from '../../section/EditableSection/EditableSection'
import { LicenceGroup } from '../LicenceGroup/LicenceGroup'
import { LicencesEditor } from '../LicencesEditor/LicencesEditor'
import { inDisplayOrder, LICENCE_CATEGORY_LABELS } from '../../../lib/licences'
import { strings } from '@/shared/i18n'

/** Driving, flying and boating licences, as labels grouped by kind. */
export function LicencesSection({ value, canEdit, onSave }: { value: Licence[]; canEdit: boolean; onSave: (value: Licence[]) => Promise<void> }) {
  // Grouped by kind, in display order, leaving out kinds with none.
  const groups = LICENCE_CATEGORIES.map((category) => ({
    category,
    label: LICENCE_CATEGORY_LABELS[category],
    licences: inDisplayOrder(value.filter((l) => l.category === category)),
  })).filter((group) => group.licences.length > 0)
  return (
    <EditableSection title={strings.common.licences} errorKeys={['licences']} value={value} canEdit={canEdit} onSave={onSave} editor={LicencesEditor}>
      {groups.length === 0 ? (
        <p className="muted">{strings.common.nothingHereYet}</p>
      ) : (
        <div className="licence-groups">
          {groups.map((group) => (
            <LicenceGroup key={group.category} {...group} />
          ))}
        </div>
      )}
    </EditableSection>
  )
}
