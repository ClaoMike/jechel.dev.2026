import type { AppCategory } from '../../../services/api'

export interface CategoryPickerProps {
  categories: AppCategory[]
  value: number[]
  onChange: (ids: number[]) => void
  error?: string
}

/** The app's categories as toggle buttons. The chosen ones are kept in the categories' order. */
export function CategoryPicker({ categories, value, onChange, error }: CategoryPickerProps) {
  function toggle(id: number) {
    const next = value.includes(id) ? value.filter((v) => v !== id) : [...value, id]
    onChange(categories.map((c) => c.id).filter((c) => next.includes(c)))
  }

  return (
    <fieldset className="app-field">
      <legend className="field-label">Kind of app</legend>
      {categories.length === 0 ? (
        <p className="field-hint">No categories yet: add them with Categories, above the apps.</p>
      ) : (
        <div className="licence-toggles">
          {categories.map((category) => (
            <button key={category.id} type="button" className="licence-toggle" aria-pressed={value.includes(category.id)} onClick={() => toggle(category.id)}>
              {category.name}
            </button>
          ))}
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </fieldset>
  )
}
