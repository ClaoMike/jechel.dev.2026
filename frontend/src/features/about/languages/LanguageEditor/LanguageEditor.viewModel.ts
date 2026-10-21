import { useId } from 'react'
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

/** One language's name and level. */
export function useLanguageEditorViewModel({ index, language, onChange }: LanguageEditorProps) {
  return {
    levelId: useId(),
    legend: `Language ${index + 1}`,
    name: `language ${index + 1}`,
    levels: LANGUAGE_LEVELS.map((level) => ({ value: level, label: LANGUAGE_LEVEL_LABELS[level] })),
    setName: (name: string) => onChange({ ...language, name }),
    setLevel: (level: string) => onChange({ ...language, level: level as LanguageLevel }),
  }
}
