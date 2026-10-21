import { useState } from 'react'
import { useListAppCategoriesQuery } from '../../../store/api/appsApi'

export function useCategoriesButtonViewModel() {
  const [editing, setEditing] = useState(false)
  // The same cached list the Apps page loads for the admin.
  const { data: categories = [] } = useListAppCategoriesQuery()

  return {
    categories,
    editing,
    edit: () => setEditing(true),
    stopEditing: () => setEditing(false),
  }
}
