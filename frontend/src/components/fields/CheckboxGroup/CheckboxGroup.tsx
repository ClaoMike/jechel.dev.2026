import { useCheckboxGroupViewModel, type CheckboxGroupProps } from './CheckboxGroup.viewModel'

/** A row of checkboxes for picking some of a fixed set, e.g. what a skill was used for. */
export function CheckboxGroup<T extends string>(props: CheckboxGroupProps<T>) {
  const vm = useCheckboxGroupViewModel(props)
  return (
    <fieldset className="checkbox-group" aria-describedby={vm.errorId}>
      <legend className="field-label">{props.label}</legend>
      <div className="checkbox-group-options">
        {vm.options.map((option) => (
          <label key={option.key} className="checkbox-field">
            <input type="checkbox" checked={option.checked} onChange={(e) => option.toggle(e.target.checked)} />
            {option.color && <span className="legend-swatch" style={{ background: option.color }} aria-hidden="true" />}
            {option.label}
          </label>
        ))}
      </div>
      {props.error && (
        <p className="field-error" id={vm.errorId}>
          {props.error}
        </p>
      )}
    </fieldset>
  )
}
