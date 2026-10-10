import type { SkillUse, VisitKind } from '../../services/api'

export const SKILL_USE_LABELS: Record<SkillUse, string> = { work: 'Work', academic: 'Academic', personal: 'Personal' }

export const VISIT_LABELS: Record<VisitKind, string> = { worked: 'Worked', studied: 'Studied', visited: 'Visited' }

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
