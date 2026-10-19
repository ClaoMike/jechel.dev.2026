import { move, removeAt, replaceAt } from '../../list'

export interface BulletsEditorProps {
  /** What one is called: "bullet point" → "Bullet point 2", "Add bullet point". */
  itemName: string
  value: string[]
  onChange: (value: string[]) => void
  errorFor: (index: number) => string | undefined
  listError?: string
  multiline?: boolean
}

/** One row per bullet, reorderable and removable; empty bullets are dropped by the API on save. */
export function useBulletsEditorViewModel({ itemName, value, onChange, errorFor }: BulletsEditorProps) {
  const label = itemName.charAt(0).toUpperCase() + itemName.slice(1)
  return {
    rows: value.map((text, i) => ({
      key: i,
      label: `${label} ${i + 1}`,
      name: `${itemName} ${i + 1}`,
      index: i,
      count: value.length,
      text,
      error: errorFor(i),
      onChange: (next: string) => onChange(replaceAt(value, i, next)),
      onMove: (from: number, to: number) => onChange(move(value, from, to)),
      onRemove: () => onChange(removeAt(value, i)),
    })),
    addLabel: `Add ${itemName}`,
    add: () => onChange([...value, '']),
  }
}
