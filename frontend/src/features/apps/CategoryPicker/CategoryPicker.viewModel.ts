import type { AppCategory } from '../../../services/api'

export interface CategoryPickerProps {
  categories: AppCategory[]
  value: number[]
  onChange: (ids: number[]) => void
  error?: string
}

/** The categories as toggles; the chosen ones are kept in the categories' order. */
export function useCategoryPickerViewModel({ categories, value, onChange }: CategoryPickerProps) {
  return {
    empty: categories.length === 0,
    options: categories.map((category) => ({
      key: category.id,
      name: category.name,
      on: value.includes(category.id),
      toggle: () => {
        const next = value.includes(category.id) ? value.filter((v) => v !== category.id) : [...value, category.id]
        onChange(categories.map((c) => c.id).filter((c) => next.includes(c)))
      },
    })),
  }
}
