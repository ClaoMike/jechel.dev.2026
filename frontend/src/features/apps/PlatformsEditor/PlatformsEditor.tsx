import { AddButton, TextField } from '../../../components/fields'
import { usePlatformsEditorViewModel, type PlatformsEditorProps } from './PlatformsEditor.viewModel'

/** What the app runs on: one click for the common ones, or type another. */
export function PlatformsEditor(props: PlatformsEditorProps) {
  const vm = usePlatformsEditorViewModel(props)
  return (
    <fieldset className="app-field">
      <legend className="field-label">Runs on</legend>
      <div className="licence-toggles">
        {vm.platforms.map((platform) => (
          <button key={platform.name} type="button" className="licence-toggle" aria-pressed={platform.on} onClick={platform.toggle}>
            {platform.name}
          </button>
        ))}
      </div>
      <div className="app-inline-add" onKeyDown={vm.onKeyDown}>
        <TextField label="Another platform" value={vm.own} onChange={vm.setOwn} placeholder="e.g. Meta Quest" />
        <AddButton onClick={vm.addOwn}>Add platform</AddButton>
      </div>
      {props.error && <p className="field-error">{props.error}</p>}
    </fieldset>
  )
}
