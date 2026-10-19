import type { FieldErrors } from '../../../components/fields'
import type { AppLink } from '../../../services/api'
import { removeAt, replaceAt } from '../../about/list'
import { STORE_SUGGESTIONS } from '../appOptions'

export interface LinksEditorProps {
  value: AppLink[]
  onChange: (links: AppLink[]) => void
  errors: FieldErrors
}

/** Each link's store name and address (with their errors), removed or added. */
export function useLinksEditorViewModel({ value, onChange, errors }: LinksEditorProps) {
  return {
    suggestions: STORE_SUGGESTIONS,
    links: value.map((link, i) => ({
      key: i,
      labelField: `Check it on… (link ${i + 1})`,
      urlField: `Address (link ${i + 1})`,
      name: `link ${i + 1}`,
      link,
      labelError: errors[`links[${i}].label`],
      urlError: errors[`links[${i}].url`],
      setLabel: (label: string) => onChange(replaceAt(value, i, { ...link, label })),
      setUrl: (url: string) => onChange(replaceAt(value, i, { ...link, url })),
      remove: () => onChange(removeAt(value, i)),
    })),
    listError: errors.links,
    add: () => onChange([...value, { label: '', url: '' }]),
  }
}
