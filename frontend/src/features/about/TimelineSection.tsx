import { useId, useState } from 'react'
import { SortIcon } from '../../components/icons'
import type { EducationItem, ExperienceItem } from '../../services/api'
import { BulletsEditor } from './BulletsSection'
import { EditableSection } from './EditableSection'
import { AddButton, ItemControls, MonthField, TextField, type FieldErrors } from './fields'
import { currentMonth, formatPeriod, isUpcoming } from './format'
import { move, removeAt, replaceAt, sortByEndDate } from './list'
import { RichText } from './RichText'

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
      errorKeys={[config.key]}
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
        <h3>
          <RichText text={entry.title} />
        </h3>
        {isUpcoming(entry.start) && <span className="tag">Upcoming</span>}
      </div>
      <p className="timeline-meta">
        <span>
          <RichText text={entry.organization} />
        </span>
        {entry.location && (
          <span>
            <RichText text={entry.location} />
          </span>
        )}
      </p>
      <p className="timeline-period">
        <time dateTime={entry.start.slice(0, 7)}>{formatPeriod(entry.start, entry.end)}</time>
      </p>
      {entry.bullets && entry.bullets.length > 0 && (
        <ul className="bullets">
          {entry.bullets.map((bullet, i) => (
            <li key={i}>
              <RichText text={bullet} />
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function TimelineEditor<T>({ config, value, onChange, errors }: { config: TimelineConfig<T>; value: TimelineEntry[]; onChange: (value: TimelineEntry[]) => void; errors: FieldErrors }) {
  const newEntry = (): TimelineEntry => ({ title: '', organization: '', location: '', start: currentMonth(), end: null, ...(config.withBullets ? { bullets: [''] } : {}) })
  const [sorted, setSorted] = useState(false)
  const change = (entries: TimelineEntry[]) => {
    setSorted(false)
    onChange(entries)
  }

  return (
    <div className="editor-list">
      <div className="editor-list-header">
        <p className="muted editor-note">Shown in this order. Move entries with the arrows, or sort them by end date.</p>
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={value.length < 2}
          onClick={() => {
            onChange(sortByEndDate(value))
            setSorted(true)
          }}
        >
          <SortIcon size={16} />
          Sort by end date
        </button>
      </div>
      <p role="status" className={sorted ? 'editor-status' : 'visually-hidden'}>
        {sorted ? 'Sorted by end date, ongoing first. Save to keep this order, or Cancel to undo.' : ''}
      </p>
      {value.map((entry, i) => (
        <TimelineEntryEditor
          key={i}
          config={config}
          index={i}
          count={value.length}
          entry={entry}
          errorAt={(field) => errors[`${config.key}[${i}].${field}`]}
          errors={errors}
          onChange={(next) => change(replaceAt(value, i, next))}
          onMove={(from, to) => change(move(value, from, to))}
          onRemove={() => change(removeAt(value, i))}
        />
      ))}
      {errors[config.key] && <p className="field-error">{errors[config.key]}</p>}
      <AddButton onClick={() => change([newEntry(), ...value])}>Add {config.itemName}</AddButton>
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
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

function TimelineEntryEditor<T>({ config, index, count, entry, errorAt, errors, onChange, onMove, onRemove }: EntryEditorProps<T>) {
  const ongoingId = useId()
  const name = `${config.itemName} ${index + 1}`
  const set = (patch: Partial<TimelineEntry>) => onChange({ ...entry, ...patch })

  return (
    <fieldset className="editor-item">
      <legend>{name.charAt(0).toUpperCase() + name.slice(1)}</legend>
      <div className="editor-item-toolbar">
        <ItemControls name={name} index={index} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      <div className="editor-grid">
        <TextField label={config.titleLabel} value={entry.title} required onChange={(title) => set({ title })} error={errorAt('title')} allowLinks />
        <TextField label={config.organizationLabel} value={entry.organization} required onChange={(organization) => set({ organization })} error={errorAt(config.organizationKey)} allowLinks />
        <TextField label="Location (optional)" value={entry.location} onChange={(location) => set({ location })} error={errorAt('location')} allowLinks />
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
