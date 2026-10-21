import { ColorLegend } from '../../section/ColorLegend/ColorLegend'
import { EditableSection } from '../../section/EditableSection/EditableSection'
import { PlacesEditor } from '../PlacesEditor/PlacesEditor'
import { WorldMap } from '../WorldMap/WorldMap'
import { usePlacesSectionViewModel, type PlacesValue } from './PlacesSection.viewModel'

export type { PlacesValue }

/** "Where I've been": a dotted world map with a pin for every city the admin has added. */
export function PlacesSection({ value, canEdit, onSave }: { value: PlacesValue; canEdit: boolean; onSave: (value: PlacesValue) => Promise<void> }) {
  const vm = usePlacesSectionViewModel(value)
  return (
    <EditableSection title="Where I've been" errorKeys={['places', 'colors.places']} value={value} canEdit={canEdit} onSave={onSave} editor={PlacesEditor}>
      <ColorLegend items={vm.legend} round hint={vm.hint} />
      <WorldMap places={value.places} colors={value.colors} />
      {vm.empty && <p className="muted">No places yet.</p>}
    </EditableSection>
  )
}
