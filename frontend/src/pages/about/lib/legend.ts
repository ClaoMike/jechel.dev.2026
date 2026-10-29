import type { LanguageLevel, SkillUse, VisitKind } from '@/shared/api'
import { strings } from '@/shared/i18n'

export const SKILL_USE_LABELS: Record<SkillUse, string> = { work: strings.legend.work, academic: strings.legend.academic, personal: strings.legend.personal }

export const LANGUAGE_LEVEL_LABELS: Record<LanguageLevel, string> = {
  native: strings.legend.native,
  fluent: strings.legend.fluent,
  advanced: strings.legend.advanced,
  intermediate: strings.legend.intermediate,
  beginner: strings.legend.beginner,
}

export const VISIT_LABELS: Record<VisitKind, string> = { worked: strings.legend.worked, studied: strings.legend.studied, visited: strings.legend.visited }

/**
 * A CSS background split into equal hard-edged bands, one per colour: one colour is a plain
 * fill, several are stripes ("to bottom" for a bar) or slices ("conic" for a dot).
 */
export function splitBackground(colors: string[], shape: 'bands' | 'slices'): string {
  if (colors.length === 0) return 'transparent'
  if (colors.length === 1) return colors[0]
  const step = 100 / colors.length
  const stops = colors.map((color, i) => `${color} ${i * step}% ${(i + 1) * step}%`).join(', ')
  return shape === 'bands' ? `linear-gradient(to bottom, ${stops})` : `conic-gradient(${stops})`
}
