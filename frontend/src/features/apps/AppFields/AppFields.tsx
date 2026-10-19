import { DeleteButton } from '../../../components/DeleteButton/DeleteButton'
import { ExternalLinkIcon } from '../../../components/icons/icons'
import type { AppCategory, AppLink } from '../../../services/api'
import { AddButton, TextField, type FieldErrors } from '../../about/fields/fields'
import { isSafeUrl } from '../../about/format'
import { removeAt, replaceAt } from '../../about/list'
import { useCategoryPickerViewModel, usePlatformsEditorViewModel } from './AppFields.viewModel'
import { STORE_SUGGESTIONS } from '../appOptions'

/** The app's categories as toggle buttons. Kept in the categories' order. */
export function CategoryPicker({ categories, value, onChange, error }: { categories: AppCategory[]; value: number[]; onChange: (ids: number[]) => void; error?: string }) {
  const vm = useCategoryPickerViewModel(categories.map((c) => c.id), value, onChange)
  return (
    <fieldset className="app-field">
      <legend className="field-label">Kind of app</legend>
      {categories.length === 0 ? (
        <p className="field-hint">No categories yet: add them with Categories, next to the Apps heading.</p>
      ) : (
        <div className="licence-toggles">
          {categories.map((category) => (
            <button key={category.id} type="button" className="licence-toggle" aria-pressed={vm.selected(category.id)} onClick={() => vm.toggle(category.id)}>
              {category.name}
            </button>
          ))}
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </fieldset>
  )
}

/** What the app runs on: one click for the common ones, or type another. */
export function PlatformsEditor({ value, onChange, error }: { value: string[]; onChange: (platforms: string[]) => void; error?: string }) {
  const vm = usePlatformsEditorViewModel(value, onChange)

  return (
    <fieldset className="app-field">
      <legend className="field-label">Runs on</legend>
      <div className="licence-toggles">
        {vm.platforms.map((platform) => (
          <button key={platform.name} type="button" className="licence-toggle" aria-pressed={platform.on} onClick={() => vm.toggle(platform.name)}>
            {platform.name}
          </button>
        ))}
      </div>
      <div className="app-inline-add" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), vm.addOwn())}>
        <TextField label="Another platform" value={vm.own} onChange={vm.setOwn} placeholder="e.g. Meta Quest" />
        <AddButton onClick={vm.addOwn}>Add platform</AddButton>
      </div>
      {error && <p className="field-error">{error}</p>}
    </fieldset>
  )
}

/** "Check it on …" links: a store name and its address each. */
export function LinksEditor({ value, onChange, errors }: { value: AppLink[]; onChange: (links: AppLink[]) => void; errors: FieldErrors }) {
  return (
    <fieldset className="app-field">
      <legend className="field-label">Where to get it</legend>
      <p className="field-hint">Each shows as a “Check it on …” button in the popup.</p>
      {value.map((link, i) => (
        <div key={i} className="app-link-editor">
          <TextField
            label={`Check it on… (link ${i + 1})`}
            value={link.label}
            placeholder="App Store"
            suggestions={STORE_SUGGESTIONS}
            onChange={(label) => onChange(replaceAt(value, i, { ...link, label }))}
            error={errors[`links[${i}].label`]}
          />
          <TextField label={`Address (link ${i + 1})`} type="url" value={link.url} placeholder="https://…" onChange={(url) => onChange(replaceAt(value, i, { ...link, url }))} error={errors[`links[${i}].url`]} />
          <DeleteButton what={`link ${i + 1}`} action="Remove" detail="It goes when you save the app; Cancel keeps it." onDelete={() => onChange(removeAt(value, i))} />
        </div>
      ))}
      {errors.links && <p className="field-error">{errors.links}</p>}
      <AddButton onClick={() => onChange([...value, { label: '', url: '' }])}>Add a link</AddButton>
    </fieldset>
  )
}

/** "Check it on Steam", the whole button a link. */
export function StoreLinks({ links }: { links: AppLink[] }) {
  const safe = links.filter((link) => isSafeUrl(link.url))
  if (safe.length === 0) return null
  return (
    <ul className="app-links" aria-label="Where to get it">
      {safe.map((link, i) => (
        <li key={i}>
          <a className="button app-link" href={link.url} target="_blank" rel="noopener noreferrer">
            Check it on {link.label}
            <ExternalLinkIcon size={16} />
          </a>
        </li>
      ))}
    </ul>
  )
}

/** The app's categories, as labels. */
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
