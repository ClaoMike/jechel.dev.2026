import { LANGUAGE_LEVELS, type Language } from '../../../../services/api'
import { LANGUAGE_LEVEL_LABELS } from '../../legend'
import { EditableSection } from '../../section/EditableSection/EditableSection'
import { LanguageItem, type LanguageView } from '../LanguageItem/LanguageItem'
import { LanguagesEditor } from '../LanguagesEditor/LanguagesEditor'
import { strings } from '../../../../strings'

/** Languages and how well I speak them: a word, and as many filled steps (5 for native, 1 for beginner). */
export function LanguagesSection({ value, canEdit, onSave }: { value: Language[]; canEdit: boolean; onSave: (value: Language[]) => Promise<void> }) {
  const languages = value.map((language): LanguageView => {
    const filled = LANGUAGE_LEVELS.length - LANGUAGE_LEVELS.indexOf(language.level)
    return { name: language.name, level: LANGUAGE_LEVEL_LABELS[language.level], steps: LANGUAGE_LEVELS.map((_, s) => s < filled) }
  })
  return (
    <EditableSection title={strings.common.languages} errorKeys={['languages']} value={value} canEdit={canEdit} onSave={onSave} editor={LanguagesEditor}>
      {languages.length === 0 ? (
        <p className="muted">{strings.common.nothingHereYet}</p>
      ) : (
        <ul className="languages">
          {languages.map((language, i) => (
            <LanguageItem key={i} language={language} />
          ))}
        </ul>
      )}
    </EditableSection>
  )
}
