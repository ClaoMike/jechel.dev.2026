import { LANGUAGE_LEVELS, type Language } from '../../../../services/api'
import { LANGUAGE_LEVEL_LABELS } from '../../legend'

export interface LanguageView {
  name: string
  level: string
  /** One per level, filled up to this language's (5 for native, 1 for beginner). */
  steps: boolean[]
}

/** The languages with their level as a word and as filled steps. */
export function useLanguagesSectionViewModel(value: Language[]) {
  return {
    languages: value.map((language): LanguageView => {
      const filled = LANGUAGE_LEVELS.length - LANGUAGE_LEVELS.indexOf(language.level)
      return { name: language.name, level: LANGUAGE_LEVEL_LABELS[language.level], steps: LANGUAGE_LEVELS.map((_, s) => s < filled) }
    }),
  }
}
