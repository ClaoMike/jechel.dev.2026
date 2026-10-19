import { ArrowDownIcon, PencilIcon } from '../../../../components/icons/icons'

export interface SectionHeaderProps {
  title: string
  headingId: string
  /** The section's body, which the collapse button shows and hides. */
  bodyId: string
  /** The heading is visually hidden (still read out) and the buttons float over the content. */
  floating: boolean
  /** "Edit {editLabel}", read out on the Edit button. */
  editLabel: string
  /** Show the Edit button (the admin, not already editing). */
  canEdit: boolean
  /** Show the collapse button (not while editing). */
  canCollapse: boolean
  open: boolean
  edit: () => void
  toggleCollapsed: () => void
}

/** A section's title, with the admin's Edit button and the collapse button. */
export function SectionHeader({ title, headingId, bodyId, floating, editLabel, canEdit, canCollapse, open, edit, toggleCollapsed }: SectionHeaderProps) {
  return (
    <div className={floating ? 'about-section-header about-section-header-floating' : 'about-section-header'}>
      <h2 id={headingId} className={floating ? 'visually-hidden' : undefined}>
        {title}
      </h2>
      <div className="about-section-actions">
        {canEdit && (
          <button type="button" className="button button-secondary button-small" onClick={edit}>
            <PencilIcon size={16} />
            Edit <span className="visually-hidden">{editLabel}</span>
          </button>
        )}
        {canCollapse && (
          <button
            type="button"
            className="icon-button collapse-button"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
            title={open ? 'Collapse' : 'Expand'}
            onClick={toggleCollapsed}
          >
            <ArrowDownIcon />
          </button>
        )}
      </div>
    </div>
  )
}
