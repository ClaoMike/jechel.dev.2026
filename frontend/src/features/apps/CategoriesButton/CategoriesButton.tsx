import { useState } from 'react'
import { useListAppCategoriesQuery } from '../../../store/api/appsApi'
import { CategoriesDialog } from '../CategoriesDialog/CategoriesDialog'
import { strings } from '../../../strings'

/** The admin's Categories button above the Apps grid, and the popup it opens to edit the list. */
export function CategoriesButton() {
  const [editing, setEditing] = useState(false)
  // The same cached list the Apps page loads for the admin.
  const { data: categories = [] } = useListAppCategoriesQuery()

  return (
    <>
      <button type="button" className="button button-secondary button-small" onClick={() => setEditing(true)}>
        {strings.categoriesButton.categories}
      </button>
      {editing && <CategoriesDialog categories={categories} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    </>
  )
}
