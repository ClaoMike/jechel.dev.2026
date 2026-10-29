import { AddButton, type EditorProps } from '@/shared/ui/fields'
import type { Language } from '@/shared/api'
import { LanguageEditor } from '../LanguageEditor/LanguageEditor'
import { move, removeAt, replaceAt } from '@/shared/lib/list'
import { strings } from '@/shared/i18n'

/** Every language and its level, reorderable; a new one starts as a beginner. */
export function LanguagesEditor({ value, onChange, errors }: EditorProps<Language[]>) {
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
      <AddButton onClick={() => onChange([...value, { name: '', level: 'beginner' }])}>{strings.languagesEditor.addLanguage}</AddButton>
    </div>
  )
}
