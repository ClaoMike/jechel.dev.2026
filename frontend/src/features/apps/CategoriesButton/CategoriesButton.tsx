import { CategoriesDialog } from '../CategoriesDialog/CategoriesDialog'
import { useCategoriesButtonViewModel } from './CategoriesButton.viewModel'

/** The admin's Categories button above the Apps grid, and the popup it opens to edit the list. */
export function CategoriesButton() {
  const vm = useCategoriesButtonViewModel()

  return (
    <>
      <button type="button" className="button button-secondary button-small" onClick={vm.edit}>
        Categories
      </button>
      {vm.editing && <CategoriesDialog categories={vm.categories} onClose={vm.stopEditing} onSaved={vm.stopEditing} />}
    </>
  )
}
