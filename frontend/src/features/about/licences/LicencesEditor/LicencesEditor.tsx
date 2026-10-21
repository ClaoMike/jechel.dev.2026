import type { EditorProps } from '../../../../components/fields'
import type { Licence } from '../../../../services/api'
import { OfferedLicences } from '../OfferedLicences/OfferedLicences'
import { OwnLicenceForm } from '../OwnLicenceForm/OwnLicenceForm'
import { OwnLicences } from '../OwnLicences/OwnLicences'
import { useLicencesEditorViewModel } from './LicencesEditor.viewModel'

/** Click the licences you have (driving, flying, boating), or add your own. */
export function LicencesEditor(props: EditorProps<Licence[]>) {
  const vm = useLicencesEditorViewModel(props)
  return (
    <div className="editor-list">
      <p className="muted editor-note">Click the ones you have.</p>
      {vm.offered.map((group) => (
        <OfferedLicences key={group.category} {...group} />
      ))}
      <fieldset className="editor-item">
        <legend>Others</legend>
        <OwnLicences licences={vm.own} />
        <OwnLicenceForm onAdd={vm.addOwn} />
      </fieldset>
      {vm.listError && <p className="field-error">{vm.listError}</p>}
    </div>
  )
}
