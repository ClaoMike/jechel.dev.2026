import { useCategoryPickerViewModel, type CategoryPickerProps } from './CategoryPicker.viewModel'

/** The app's categories as toggle buttons. Kept in the categories' order. */
export function CategoryPicker(props: CategoryPickerProps) {
  const vm = useCategoryPickerViewModel(props)
  return (
    <fieldset className="app-field">
      <legend className="field-label">Kind of app</legend>
      {vm.empty ? (
        <p className="field-hint">No categories yet: add them with Categories, above the apps.</p>
      ) : (
        <div className="licence-toggles">
          {vm.options.map((option) => (
            <button key={option.key} type="button" className="licence-toggle" aria-pressed={option.on} onClick={option.toggle}>
              {option.name}
            </button>
          ))}
        </div>
      )}
      {props.error && <p className="field-error">{props.error}</p>}
    </fieldset>
  )
}
