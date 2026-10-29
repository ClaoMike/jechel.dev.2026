import { ColorLegend } from '../../section/ColorLegend/ColorLegend'
import { EditableSection } from '../../section/EditableSection/EditableSection'
import { PlacesEditor } from '../PlacesEditor/PlacesEditor'
import { WorldMap } from '../WorldMap/WorldMap'
import { VISIT_KINDS } from '@/shared/api'
import { VISIT_LABELS } from '../../../lib/legend'
import type { PlacesValue } from '../../../lib/places'
import { strings } from '@/shared/i18n'

export type { PlacesValue }

/** "Where I've been": a dotted world map with a pin for every city the admin has added. */
export function PlacesSection({ value, canEdit, onSave }: { value: PlacesValue; canEdit: boolean; onSave: (value: PlacesValue) => Promise<void> }) {
  // The legend: a coloured dot for each kind of visit.
  const legend = VISIT_KINDS.map((kind) => ({ key: kind, label: VISIT_LABELS[kind], color: value.colors[kind] }))
  return (
    <EditableSection title={strings.placesSection.whereIveBeen} errorKeys={['places', 'colors.places']} value={value} canEdit={canEdit} onSave={onSave} editor={PlacesEditor}>
      <ColorLegend items={legend} round hint={strings.placesSection.pinchCtrlScrollZoom} />
      <WorldMap places={value.places} colors={value.colors} />
      {value.places.length === 0 && <p className="muted">{strings.placesSection.noPlacesYet}</p>}
    </EditableSection>
  )
}
