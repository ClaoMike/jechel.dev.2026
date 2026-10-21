import { ItemControls, TextField } from '../../../../components/fields'
import { useLanguageEditorViewModel, type LanguageEditorProps } from './LanguageEditor.viewModel'

/** One language: its name and level, with move and remove. */
export function LanguageEditor(props: LanguageEditorProps) {
  const { index, count, language, nameError, levelError, onMove, onRemove } = props
  const vm = useLanguageEditorViewModel(props)
  return (
    <fieldset className="editor-item editor-item-inline">
      <legend className="visually-hidden">{vm.legend}</legend>
      <TextField label="Language" value={language.name} required onChange={vm.setName} error={nameError} />
      <div className="field">
        <label htmlFor={vm.levelId}>Level</label>
        <select id={vm.levelId} className="select" value={language.level} onChange={(e) => vm.setLevel(e.target.value)} aria-invalid={levelError ? true : undefined}>
          {vm.levels.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
        {levelError && <p className="field-error">{levelError}</p>}
      </div>
      <ItemControls name={vm.name} index={index} count={count} onMove={onMove} onRemove={onRemove} />
    </fieldset>
  )
}
