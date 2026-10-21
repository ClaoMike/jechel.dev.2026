import { AddButton, TextField } from '../../../../components/fields'
import type { Licence } from '../../../../services/api'
import { useOwnLicenceFormViewModel } from './OwnLicenceForm.viewModel'

/** A licence that isn't offered: kind, optional code, and what it's for. */
export function OwnLicenceForm({ onAdd }: { onAdd: (licence: Licence) => void }) {
  const vm = useOwnLicenceFormViewModel(onAdd)
  const { draft } = vm

  return (
    <div className="licence-own-form" onKeyDown={vm.onKeyDown}>
      <div className="field">
        <label htmlFor={vm.categoryId}>Kind</label>
        <select id={vm.categoryId} className="select" value={draft.category} onChange={(e) => vm.setCategory(e.target.value)}>
          {vm.categories.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </div>
      <TextField label="Code (optional)" value={draft.code} onChange={(code) => vm.change({ code })} placeholder="e.g. T" />
      <TextField label="For" value={draft.name} onChange={(name) => vm.change({ name })} placeholder="e.g. Tractor" error={vm.error ?? undefined} />
      <AddButton onClick={vm.add}>Add licence</AddButton>
    </div>
  )
}
