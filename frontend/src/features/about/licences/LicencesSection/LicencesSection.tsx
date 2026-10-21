import type { Licence } from '../../../../services/api'
import { EditableSection } from '../../section/EditableSection/EditableSection'
import { LicenceGroup } from '../LicenceGroup/LicenceGroup'
import { LicencesEditor } from '../LicencesEditor/LicencesEditor'
import { useLicencesSectionViewModel } from './LicencesSection.viewModel'

/** Driving, flying and boating licences, as labels grouped by kind. */
export function LicencesSection({ value, canEdit, onSave }: { value: Licence[]; canEdit: boolean; onSave: (value: Licence[]) => Promise<void> }) {
  const vm = useLicencesSectionViewModel(value)
  return (
    <EditableSection title="Licences" errorKeys={['licences']} value={value} canEdit={canEdit} onSave={onSave} editor={LicencesEditor}>
      {vm.groups.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <div className="licence-groups">
          {vm.groups.map((group) => (
            <LicenceGroup key={group.category} {...group} />
          ))}
        </div>
      )}
    </EditableSection>
  )
}
