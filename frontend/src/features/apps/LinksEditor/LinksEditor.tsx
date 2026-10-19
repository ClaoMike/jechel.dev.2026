import { DeleteButton } from '../../../components/DeleteButton/DeleteButton'
import { AddButton, TextField } from '../../../components/fields'
import { useLinksEditorViewModel, type LinksEditorProps } from './LinksEditor.viewModel'

/** "Check it on …" links: a store name and its address each. */
export function LinksEditor(props: LinksEditorProps) {
  const vm = useLinksEditorViewModel(props)
  return (
    <fieldset className="app-field">
      <legend className="field-label">Where to get it</legend>
      <p className="field-hint">Each shows as a “Check it on …” button in the popup.</p>
      {vm.links.map((row) => (
        <div key={row.key} className="app-link-editor">
          <TextField label={row.labelField} value={row.link.label} placeholder="App Store" suggestions={vm.suggestions} onChange={row.setLabel} error={row.labelError} />
          <TextField label={row.urlField} type="url" value={row.link.url} placeholder="https://…" onChange={row.setUrl} error={row.urlError} />
          <DeleteButton what={row.name} action="Remove" detail="It goes when you save the app; Cancel keeps it." onDelete={row.remove} />
        </div>
      ))}
      {vm.listError && <p className="field-error">{vm.listError}</p>}
      <AddButton onClick={vm.add}>Add a link</AddButton>
    </fieldset>
  )
}
