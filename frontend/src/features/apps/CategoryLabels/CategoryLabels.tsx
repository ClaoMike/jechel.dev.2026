import type { AppCategory } from '../../../services/api'

/** The app's categories, as labels; nothing without any. */
export function CategoryLabels({ categories }: { categories: AppCategory[] }) {
  if (categories.length === 0) return null
  return (
    <span className="app-categories">
      {categories.map((category) => (
        <span key={category.id} className="app-category">
          {category.name}
        </span>
      ))}
    </span>
  )
}
