import { LinkInserter } from '../LinkInserter/LinkInserter'
import { useTextFieldViewModel, type TextFieldProps } from './TextField.viewModel'

/** A labelled text box (or text area), with an optional hint, error, suggestions and "Add link". */
export function TextField(props: TextFieldProps) {
  const { label, value, onChange, error, hint, multiline = false, type = 'text', min, max, allowLinks = false, suggestions } = props
  const { inputRef, ...vm } = useTextFieldViewModel(props)

  return (
    <div className="field">
      <label htmlFor={vm.id}>{label}</label>
      {multiline ? <textarea ref={inputRef} {...vm.common} rows={3} /> : <input ref={inputRef} {...vm.common} type={type} min={min} max={max} list={vm.suggestionsId} />}
      {suggestions && (
        <datalist id={vm.suggestionsId}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}
      {hint && (
        <p className="field-hint" id={vm.hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={vm.errorId}>
          {error}
        </p>
      )}
      {allowLinks && <LinkInserter fieldLabel={label} value={value} onChange={onChange} input={inputRef} selection={vm.selection} />}
    </div>
  )
}
