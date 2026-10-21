import type { Language } from '../../../../services/api'
import { EditableSection } from '../../section/EditableSection/EditableSection'
import { LanguageItem } from '../LanguageItem/LanguageItem'
import { LanguagesEditor } from '../LanguagesEditor/LanguagesEditor'
import { useLanguagesSectionViewModel } from './LanguagesSection.viewModel'

/** Languages and how well I speak them: a word, and as many filled steps (5 for native, 1 for beginner). */
export function LanguagesSection({ value, canEdit, onSave }: { value: Language[]; canEdit: boolean; onSave: (value: Language[]) => Promise<void> }) {
  const vm = useLanguagesSectionViewModel(value)
  return (
    <EditableSection title="Languages" errorKeys={['languages']} value={value} canEdit={canEdit} onSave={onSave} editor={LanguagesEditor}>
      {vm.languages.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <ul className="languages">
          {vm.languages.map((language, i) => (
            <LanguageItem key={i} language={language} />
          ))}
        </ul>
      )}
    </EditableSection>
  )
}
