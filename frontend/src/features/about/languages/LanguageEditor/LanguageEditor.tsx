import { useId } from 'react'
import { ItemControls, TextField } from '../../../../components/fields'
import { LANGUAGE_LEVELS, type Language, type LanguageLevel } from '../../../../services/api'
import { LANGUAGE_LEVEL_LABELS } from '../../legend'

export interface LanguageEditorProps {
  index: number
  count: number
  language: Language
  nameError?: string
  levelError?: string
  onChange: (language: Language) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

/** One language: its name and level, with move and remove. */
export function LanguageEditor({ index, count, language, nameError, levelError, onChange, onMove, onRemove }: LanguageEditorProps) {
  const levelId = useId()
  return (
    <fieldset className="editor-item editor-item-inline">
      <legend className="visually-hidden">Language {index + 1}</legend>
      <TextField label="Language" value={language.name} required onChange={(name) => onChange({ ...language, name })} error={nameError} />
      <div className="field">
        <label htmlFor={levelId}>Level</label>
        <select
          id={levelId}
          className="select"
          value={language.level}
          onChange={(e) => onChange({ ...language, level: e.target.value as LanguageLevel })}
          aria-invalid={levelError ? true : undefined}
        >
          {LANGUAGE_LEVELS.map((level) => (
            <option key={level} value={level}>
              {LANGUAGE_LEVEL_LABELS[level]}
            </option>
          ))}
        </select>
        {levelError && <p className="field-error">{levelError}</p>}
      </div>
      <ItemControls name={`language ${index + 1}`} index={index} count={count} onMove={onMove} onRemove={onRemove} />
    </fieldset>
  )
}
