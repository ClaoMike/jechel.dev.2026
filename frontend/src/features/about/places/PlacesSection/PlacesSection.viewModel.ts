import { VISIT_KINDS, type AboutColors, type Place } from '../../../../services/api'
import { VISIT_LABELS } from '../../legend'

export interface PlacesValue {
  places: Place[]
  colors: AboutColors['places']
}

/** The legend: a coloured dot for each kind of visit. */
export function usePlacesSectionViewModel(value: PlacesValue) {
  return {
    legend: VISIT_KINDS.map((kind) => ({ key: kind, label: VISIT_LABELS[kind], color: value.colors[kind] })),
    hint: 'Pinch or Ctrl + scroll to zoom',
    empty: value.places.length === 0,
  }
}
