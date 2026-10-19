import type { ReactNode } from 'react'
import { DeleteButton } from '../../../components/DeleteButton/DeleteButton'
import { ArrowDownIcon, ArrowUpIcon, LinkIcon, PlusIcon } from '../../../components/icons/icons'
import type { FieldErrors } from '../../../utils/saveErrors'
import { useFieldIdViewModel, useLinkInserterViewModel, useMonthFieldViewModel, useTextFieldViewModel, type LinkInserterOptions } from './fields.viewModel'

/** API field errors, first message per path, e.g. { "experience[0].title": "Required." }. */
export type { FieldErrors }

export interface EditorProps<T> {
  value: T
  onChange: (value: T) => void
  /** Changes the draft from its latest value: for async callbacks (uploads) that would otherwise overwrite each other. */
  update: (change: (current: T) => T) => void
  errors: FieldErrors
}

interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  multiline?: boolean
  type?: 'text' | 'url' | 'number' | 'tel' | 'email'
  required?: boolean
  placeholder?: string
  min?: number
  max?: number
  /** Show an "Add link" button that inserts [text](url) at the cursor. */
  allowLinks?: boolean
  /** Offered while typing; anything else can still be typed. */
  suggestions?: string[]
}

export function TextField({ label, value, onChange, error, hint, multiline = false, type = 'text', required, placeholder, min, max, allowLinks = false, suggestions }: TextFieldProps) {
  const vm = useTextFieldViewModel({ hint, error, value, required, placeholder })
  const { id, common } = vm

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...common} type={type} min={min} max={max} list={suggestions ? `${id}-suggestions` : undefined} onChange={(e) => onChange(e.target.value)} />
      )}
      {suggestions && (
        <datalist id={`${id}-suggestions`}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
      {allowLinks && <LinkInserter fieldLabel={label} value={value} onChange={onChange} input={vm.inputRef} selection={vm.selection} />}
    </div>
  )
}

/**
 * "Add link": asks for the link's text (the selected words, if any) and URL, then puts
 * [text](url) in place of the selection, or at the cursor.
 */
function LinkInserter({ fieldLabel, ...options }: LinkInserterOptions & { fieldLabel: string }) {
  const vm = useLinkInserterViewModel(options)
  const { id, draft } = vm

  if (!draft) {
    return (
      <button type="button" className="text-button" onClick={vm.open}>
        <LinkIcon size={14} />
        Add link <span className="visually-hidden">to {fieldLabel}</span>
      </button>
    )
  }

  return (
    <div className="link-inserter" role="group" aria-label={`Add a link to ${fieldLabel}`}>
      <div className="field">
        <label htmlFor={`${id}-label`}>Link text</label>
        <input id={`${id}-label`} value={draft.label} onChange={(e) => vm.setLabel(e.target.value)} onKeyDown={vm.onKeyDown} placeholder="The University of Manchester" />
      </div>
      <div className="field">
        <label htmlFor={`${id}-url`}>Link URL</label>
        <input
          id={`${id}-url`}
          type="url"
          value={draft.url}
          autoFocus
          aria-invalid={draft.error ? true : undefined}
          aria-describedby={draft.error ? `${id}-error` : undefined}
          onChange={(e) => vm.setUrl(e.target.value)}
          onKeyDown={vm.onKeyDown}
        />
      </div>
      <div className="link-inserter-actions">
        <button type="button" className="button button-small" onClick={vm.insert}>
          Insert link
        </button>
        <button type="button" className="button button-secondary button-small" onClick={vm.cancel}>
          Cancel
        </button>
      </div>
      {draft.error && (
        <p className="field-error" id={`${id}-error`}>
          {draft.error}
        </p>
      )}
    </div>
  )
}

/** A colour swatch that opens the browser's colour picker. The value is "#rrggbb". */
export function ColorField({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) {
  const { id } = useFieldIdViewModel()
  return (
    <div className="color-field">
      <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
      <label htmlFor={id}>{label}</label>
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

/** A row of checkboxes for picking some of a fixed set, e.g. what a skill was used for. */
export function CheckboxGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  labelFor,
  colorFor,
  error,
}: {
  label: string
  options: readonly T[]
  value: readonly T[]
  onChange: (value: T[]) => void
  labelFor: (option: T) => string
  colorFor?: (option: T) => string
  error?: string
}) {
  const { id } = useFieldIdViewModel()
  return (
    <fieldset className="checkbox-group" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="field-label">{label}</legend>
      <div className="checkbox-group-options">
        {options.map((option) => (
          <label key={option} className="checkbox-field">
            <input
              type="checkbox"
              checked={value.includes(option)}
              // Keep the options' own order, whatever order they're ticked in.
              onChange={(e) => onChange(options.filter((o) => (o === option ? e.target.checked : value.includes(o))))}
            />
            {colorFor && <span className="legend-swatch" style={{ background: colorFor(option) }} aria-hidden="true" />}
            {labelFor(option)}
          </label>
        ))}
      </div>
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </fieldset>
  )
}

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, i, 1))),
)

/**
 * A month: a month picker plus a year box (desktop Safari and Firefox have no <input type="month">).
 * The value is the first of the month, "YYYY-MM-01".
 */
export function MonthField({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) {
  const vm = useMonthFieldViewModel(value, onChange)
  const { id } = vm

  return (
    <div className="field" role="group" aria-labelledby={`${id}-label`} aria-describedby={error ? `${id}-error` : undefined}>
      <span className="field-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="month-field">
        <select aria-label={`${label} month`} value={vm.month} onChange={(e) => vm.setMonth(Number(e.target.value))}>
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <input
          aria-label={`${label} year`}
          inputMode="numeric"
          maxLength={4}
          value={vm.year}
          aria-invalid={error || !vm.yearValid ? true : undefined}
          onChange={(e) => vm.setYear(e.target.value)}
        />
      </div>
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

/** Under "Remove …?" in the editors: nothing is lost until the section is saved. */
export const REMOVE_DETAIL = 'It goes when you save this section; Cancel brings it back.'

/** Move up / move down / remove buttons for one item of an editable list. Removing asks first. */
export function ItemControls({ name, index, count, onMove, onRemove }: { name: string; index: number; count: number; onMove?: (from: number, to: number) => void; onRemove: () => void }) {
  return (
    <div className="item-controls">
      {onMove && (
        <>
          <button type="button" className="icon-button" aria-label={`Move ${name} up`} title="Move up" disabled={index === 0} onClick={() => onMove(index, index - 1)}>
            <ArrowUpIcon />
          </button>
          <button type="button" className="icon-button" aria-label={`Move ${name} down`} title="Move down" disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
            <ArrowDownIcon />
          </button>
        </>
      )}
      <DeleteButton what={name} action="Remove" detail={REMOVE_DETAIL} onDelete={onRemove} />
    </div>
  )
}

export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="button button-secondary button-small add-button" onClick={onClick}>
      <PlusIcon size={16} />
      {children}
    </button>
  )
}
