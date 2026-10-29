import type { AppCategory } from '@/shared/api'
import { CategoryLabels } from '@/entities/app'
import { strings } from '@/shared/i18n'

export interface AppDialogHeaderProps {
  titleId: string
  /** The app's title, "Edit …" or "Add an app". */
  heading: string
  /** The heading is just the app's name: browsers' translators leave it alone. */
  headingIsName: boolean
  categories: AppCategory[]
  onClose: () => void
}

/** The popup's title (with the app's labels while it's shown) and its close button. */
export function AppDialogHeader({ titleId, heading, headingIsName, categories, onClose }: AppDialogHeaderProps) {
  return (
    <div className="modal-header">
      <div className="app-heading">
        <h2 id={titleId} translate={headingIsName ? 'no' : undefined}>
          {heading}
        </h2>
        <CategoryLabels categories={categories} />
      </div>
      <button type="button" className="icon-button" onClick={onClose} aria-label={strings.common.close}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
}
