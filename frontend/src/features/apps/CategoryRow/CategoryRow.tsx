import { ItemControls, TextField } from '../../../components/fields'

export interface CategoryRowProps {
  /** "Category 2". */
  label: string
  /** For move and remove: its name, or "category 2" while it has none. */
  name: string
  value: string
  error?: string
  index: number
  count: number
  onRename: (name: string) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

/** One category in the admin's list: its name, with move and remove. */
export function CategoryRow({ label, name, value, error, index, count, onRename, onMove, onRemove }: CategoryRowProps) {
  return (
    <li className="category-row">
      <TextField label={label} value={value} onChange={onRename} error={error} />
      <ItemControls name={name} index={index} count={count} onMove={onMove} onRemove={onRemove} />
    </li>
  )
}
