import { useId } from 'react'
import type { EducationItem, ExperienceItem } from '../../services/api'
import { BulletsEditor } from './BulletsSection'
import { EditableSection } from './EditableSection'
import { AddButton, ItemControls, MonthField, TextField, type FieldErrors } from './fields'
import { currentMonth, formatPeriod, isUpcoming } from './format'
import { removeAt, replaceAt } from './list'

/** What experience and education have in common; `organization` is the company or the institution. */
interface TimelineEntry {
  title: string
  organization: string
  location: string
  start: string
  end: string | null
  bullets?: string[]
}

interface TimelineConfig<T> {
  /** API key, for field errors: "experience" → "experience[0].title". */
  key: 'experience' | 'education'
  itemName: string
  titleLabel: string
  organizationLabel: string
  /** API field name of the organization, for its errors. */
  organizationKey: 'company' | 'institution'
  withBullets: boolean
  toEntry: (item: T) => TimelineEntry
  fromEntry: (entry: TimelineEntry) => T
}

const EXPERIENCE: TimelineConfig<ExperienceItem> = {
  key: 'experience',
  itemName: 'role',
  titleLabel: 'Job title',
  organizationLabel: 'Company',
  organizationKey: 'company',
  withBullets: true,
  toEntry: ({ company, ...rest }) => ({ ...rest, organization: company }),
  fromEntry: ({ organization, bullets = [], ...rest }) => ({ ...rest, company: organization, bullets }),
}

const EDUCATION: TimelineConfig<EducationItem> = {
  key: 'education',
  itemName: 'education',
  titleLabel: 'Degree or course',
  organizationLabel: 'Institution',
  organizationKey: 'institution',
  withBullets: false,
  toEntry: ({ institution, ...rest }) => ({ ...rest, organization: institution }),
  fromEntry: ({ organization, ...rest }) => ({ ...rest, institution: organization }),
}

interface SectionProps<T> {
  value: T[]
  canEdit: boolean
  onSave: (value: T[]) => Promise<void>
}

export function ExperienceSection(props: SectionProps<ExperienceItem>) {
  return <TimelineSection title="Work experience" config={EXPERIENCE} {...props} />
}

export function EducationSection(props: SectionProps<EducationItem>) {
  return <TimelineSection title="Education" config={EDUCATION} {...props} />
}

function TimelineSection<T>({ title, config, value, canEdit, onSave }: SectionProps<T> & { title: string; config: TimelineConfig<T> }) {
  return (
    <EditableSection
      title={title}
      value={value}
      canEdit={canEdit}
      onSave={onSave}
      editor={({ value: draft, onChange, errors }) => (
        <TimelineEditor config={config} value={draft.map(config.toEntry)} onChange={(entries) => onChange(entries.map(config.fromEntry))} errors={errors} />
      )}
    >
      {value.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <ol className="timeline">
          {value.map(config.toEntry).map((entry, i) => (
            <TimelineItem key={i} entry={entry} />
          ))}
        </ol>
      )}
    </EditableSection>
  )
}

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  return (
    <li className="timeline-item">
      <div className="timeline-heading">
        <h3>{entry.title}</h3>
        {isUpcoming(entry.start) && <span className="tag">Upcoming</span>}
      </div>
      <p className="timeline-meta">
        <span>{entry.organization}</span>
        {entry.location && <span>{entry.location}</span>}
      </p>
      <p className="timeline-period">
        <time dateTime={entry.start.slice(0, 7)}>{formatPeriod(entry.start, entry.end)}</time>
      </p>
      {entry.bullets && entry.bullets.length > 0 && (
        <ul className="bullets">
          {entry.bullets.map((bullet, i) => (
            <li key={i}>{bullet}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

function TimelineEditor<T>({ config, value, onChange, errors }: { config: TimelineConfig<T>; value: TimelineEntry[]; onChange: (value: TimelineEntry[]) => void; errors: FieldErrors }) {
  const newEntry = (): TimelineEntry => ({ title: '', organization: '', location: '', start: currentMonth(), end: null, ...(config.withBullets ? { bullets: [''] } : {}) })

  return (
    <div className="editor-list">
      <p className="muted editor-note">Entries are shown newest first, ordered by their dates when you save.</p>
      {value.map((entry, i) => (
        <TimelineEntryEditor
          key={i}
          config={config}
          index={i}
          count={value.length}
          entry={entry}
          errorAt={(field) => errors[`${config.key}[${i}].${field}`]}
          errors={errors}
          onChange={(next) => onChange(replaceAt(value, i, next))}
          onRemove={() => onChange(removeAt(value, i))}
        />
      ))}
      {errors[config.key] && <p className="field-error">{errors[config.key]}</p>}
      <AddButton onClick={() => onChange([newEntry(), ...value])}>Add {config.itemName}</AddButton>
    </div>
  )
}

interface EntryEditorProps<T> {
  config: TimelineConfig<T>
  index: number
  count: number
  entry: TimelineEntry
  errorAt: (field: string) => string | undefined
  errors: FieldErrors
  onChange: (entry: TimelineEntry) => void
  onRemove: () => void
}

function TimelineEntryEditor<T>({ config, index, count, entry, errorAt, errors, onChange, onRemove }: EntryEditorProps<T>) {
  const ongoingId = useId()
  const name = `${config.itemName} ${index + 1}`
  const set = (patch: Partial<TimelineEntry>) => onChange({ ...entry, ...patch })

  return (
    <fieldset className="editor-item">
      <legend>{name.charAt(0).toUpperCase() + name.slice(1)}</legend>
      <div className="editor-item-toolbar">
        <ItemControls name={name} index={index} count={count} onRemove={onRemove} />
      </div>
      <div className="editor-grid">
        <TextField label={config.titleLabel} value={entry.title} required onChange={(title) => set({ title })} error={errorAt('title')} />
        <TextField label={config.organizationLabel} value={entry.organization} required onChange={(organization) => set({ organization })} error={errorAt(config.organizationKey)} />
        <TextField label="Location (optional)" value={entry.location} onChange={(location) => set({ location })} error={errorAt('location')} />
      </div>
      <div className="editor-period">
        <MonthField label="Start" value={entry.start} onChange={(start) => set({ start })} error={errorAt('start')} />
        {entry.end !== null && <MonthField label="End" value={entry.end} onChange={(end) => set({ end })} error={errorAt('end')} />}
        <div className="checkbox-field">
          <input id={ongoingId} type="checkbox" checked={entry.end === null} onChange={(e) => set({ end: e.target.checked ? null : entry.start })} />
          <label htmlFor={ongoingId}>Ongoing (no end date)</label>
        </div>
      </div>
      {entry.bullets && (
        <div className="editor-bullets">
          <span className="field-label">What you did</span>
          <BulletsEditor
            itemName="bullet point"
            value={entry.bullets}
            onChange={(bullets) => set({ bullets })}
            errorFor={(i) => errors[`${config.key}[${index}].bullets[${i}]`]}
            listError={errorAt('bullets')}
          />
        </div>
      )}
    </fieldset>
  )
}
