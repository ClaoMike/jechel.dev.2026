import type { EditorProps } from '../../../../components/fields'
import { ColorsFieldset } from '../../section/ColorsFieldset/ColorsFieldset'
import { CitySearch } from '../CitySearch/CitySearch'
import { PlacePopup } from '../PlacePopup/PlacePopup'
import { PlacesList } from '../PlacesList/PlacesList'
import type { PlacesValue } from '../PlacesSection/PlacesSection.viewModel'
import { WorldMap } from '../WorldMap/WorldMap'
import { usePlacesEditorViewModel } from './PlacesEditor.viewModel'

/** The colours, a city search, the map (click a pin to edit it) with the popup, and the list of places. */
export function PlacesEditor(props: EditorProps<PlacesValue>) {
  const vm = usePlacesEditorViewModel(props)
  const { value } = props

  return (
    <div className="editor-list">
      <ColorsFieldset colors={vm.colors} />
      <CitySearch onPick={vm.pick} />
      <div className="places-editor-map">
        <WorldMap places={value.places} colors={value.colors} highlight={vm.highlight} onSelect={vm.select} />
        {vm.popup && <PlacePopup {...vm.popup} />}
      </div>
      <PlacesList places={vm.list} />
      {vm.listError && <p className="field-error">{vm.listError}</p>}
    </div>
  )
}
