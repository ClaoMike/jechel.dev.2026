import { useColorFieldViewModel, type ColorFieldProps } from './ColorField.viewModel'

/** A colour swatch that opens the browser's colour picker. The value is "#rrggbb". */
export function ColorField(props: ColorFieldProps) {
  const { label, value, error } = props
  const vm = useColorFieldViewModel(props)
  return (
    <div className="color-field">
      <input id={vm.id} type="color" value={value} onChange={vm.change} aria-invalid={error ? true : undefined} aria-describedby={vm.errorId} />
      <label htmlFor={vm.id}>{label}</label>
      {error && (
        <p className="field-error" id={vm.errorId}>
          {error}
        </p>
      )}
    </div>
  )
}
