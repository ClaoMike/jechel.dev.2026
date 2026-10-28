import { DeleteButton } from '../../../components/DeleteButton/DeleteButton'
import { AddButton, TextField, type FieldErrors } from '../../../components/fields'
import type { AppLink } from '../../../services/api'
import { removeAt, replaceAt } from '../../about/list'
import { STORE_SUGGESTIONS } from '../appOptions'
import { strings } from '../../../strings'

export interface LinksEditorProps {
  value: AppLink[]
  onChange: (links: AppLink[]) => void
  errors: FieldErrors
}

/** "Check it on …" links: a store name and its address each (with their errors), removed or added. */
export function LinksEditor({ value, onChange, errors }: LinksEditorProps) {
  const links = value.map((link, i) => ({
    key: i,
    labelField: strings.linksEditor.checkLink(i + 1),
    urlField: strings.linksEditor.addressLink(i + 1),
    name: strings.linksEditor.link(i + 1),
    link,
    labelError: errors[`links[${i}].label`],
    urlError: errors[`links[${i}].url`],
    setLabel: (label: string) => onChange(replaceAt(value, i, { ...link, label })),
    setUrl: (url: string) => onChange(replaceAt(value, i, { ...link, url })),
    remove: () => onChange(removeAt(value, i)),
  }))
  return (
    <fieldset className="app-field">
      <legend className="field-label">{strings.linksEditor.check}</legend>
      {links.map((row) => (
        <div key={row.key} className="app-link-editor">
          <TextField
            label={row.labelField}
            value={row.link.label}
            placeholder={strings.linksEditor.appStore}
            suggestions={STORE_SUGGESTIONS}
            onChange={row.setLabel}
            error={row.labelError}
          />
          <TextField label={row.urlField} type="url" value={row.link.url} placeholder={strings.linksEditor.https} onChange={row.setUrl} error={row.urlError} />
          <DeleteButton what={row.name} action={strings.common.remove} detail={strings.linksEditor.goesWhenSaveApp} onDelete={row.remove} />
        </div>
      ))}
      {errors.links && <p className="field-error">{errors.links}</p>}
      <AddButton onClick={() => onChange([...value, { label: '', url: '' }])}>{strings.linksEditor.addLink}</AddButton>
    </fieldset>
  )
}
