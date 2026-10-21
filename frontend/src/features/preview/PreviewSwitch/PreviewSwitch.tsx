import { usePreviewSwitchViewModel } from './PreviewSwitch.viewModel'

/** The admin's three-way slider, like the theme switch: see the site normally, while loading, or when loading fails. */
export function PreviewSwitch() {
  const vm = usePreviewSwitchViewModel()

  return (
    <fieldset className="preview-switch" data-mode={vm.mode} style={vm.style}>
      <legend className="visually-hidden">Preview the site as</legend>
      <span className="preview-switch-thumb" aria-hidden="true" />
      {vm.options.map((option) => (
        <label key={option.value} className="preview-switch-option">
          <input type="radio" name={vm.name} value={option.value} checked={option.checked} onChange={option.choose} className="visually-hidden" />
          {option.label}
        </label>
      ))}
    </fieldset>
  )
}
