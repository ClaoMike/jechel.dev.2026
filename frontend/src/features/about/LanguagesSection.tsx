import { useId } from 'react'
import { LANGUAGE_LEVELS, type Language, type LanguageLevel } from '../../services/api'
import { EditableSection } from './EditableSection'
import { AddButton, ItemControls, TextField, type EditorProps } from './fields'
import { LANGUAGE_LEVEL_LABELS } from './legend'
import { move, removeAt, replaceAt } from './list'

/** Languages and how well I speak them: a word, and as many filled steps (5 for native, 1 for beginner). */
export function LanguagesSection({ value, canEdit, onSave }: { value: Language[]; canEdit: boolean; onSave: (value: Language[]) => Promise<void> }) {
  return (
    <EditableSection title="Languages" errorKeys={['languages']} value={value} canEdit={canEdit} onSave={onSave} editor={LanguagesEditor}>
      {value.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <ul className="languages">
          {value.map((language, i) => {
            const steps = LANGUAGE_LEVELS.length - LANGUAGE_LEVELS.indexOf(language.level)
            return (
              <li key={i} className="language">
                <span className="language-name">{language.name}</span>
                <span className="language-steps" aria-hidden="true">
                  {LANGUAGE_LEVELS.map((level, s) => (
                    <span key={level} className={s < steps ? 'language-step language-step-on' : 'language-step'} />
                  ))}
                </span>
                <span className="language-level">{LANGUAGE_LEVEL_LABELS[language.level]}</span>
              </li>
            )
          })}
        </ul>
      )}
    </EditableSection>
  )
}

function LanguagesEditor({ value, onChange, errors }: EditorProps<Language[]>) {
  return (
    <div className="editor-list">
      {value.map((language, i) => (
        <LanguageEditor
          key={i}
          index={i}
          count={value.length}
          language={language}
          nameError={errors[`languages[${i}].name`]}
          levelError={errors[`languages[${i}].level`]}
          onChange={(next) => onChange(replaceAt(value, i, next))}
          onMove={(from, to) => onChange(move(value, from, to))}
          onRemove={() => onChange(removeAt(value, i))}
        />
      ))}
      {errors.languages && <p className="field-error">{errors.languages}</p>}
      <AddButton onClick={() => onChange([...value, { name: '', level: 'beginner' }])}>Add language</AddButton>
    </div>
  )
}

interface LanguageEditorProps {
  index: number
  count: number
  language: Language
  nameError?: string
  levelError?: string
  onChange: (language: Language) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

function LanguageEditor({ index, count, language, nameError, levelError, onChange, onMove, onRemove }: LanguageEditorProps) {
  const levelId = useId()
  return (
    <fieldset className="editor-item editor-item-inline">
      <legend className="visually-hidden">Language {index + 1}</legend>
      <TextField label="Language" value={language.name} required onChange={(name) => onChange({ ...language, name })} error={nameError} />
      <div className="field">
        <label htmlFor={levelId}>Level</label>
        <select id={levelId} className="select" value={language.level} onChange={(e) => onChange({ ...language, level: e.target.value as LanguageLevel })} aria-invalid={levelError ? true : undefined}>
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
