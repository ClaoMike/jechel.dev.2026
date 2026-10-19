import { useState } from 'react'

/**
 * A list editor shown in its own order, with a button that sorts it: says so until the next change
 * (then saving keeps the order, Cancel undoes it).
 */
export function useSortableListViewModel<T>(value: T[], onChange: (value: T[]) => void, sort: (value: T[]) => T[]) {
  const [sorted, setSorted] = useState(false)
  return {
    sorted,
    canSort: value.length >= 2,
    sort: () => {
      onChange(sort(value))
      setSorted(true)
    },
    change: (next: T[]) => {
      setSorted(false)
      onChange(next)
    },
  }
}
