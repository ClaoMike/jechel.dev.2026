import { useId } from 'react'
import type { FieldErrors } from '../../../../components/fields'
import type { TimelineConfig, TimelineEntry } from '../timeline'

export interface TimelineEntryEditorProps<T> {
  config: TimelineConfig<T>
  index: number
  count: number
  entry: TimelineEntry
  errors: FieldErrors
  onChange: (entry: TimelineEntry) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

/** One entry's fields and their errors (keyed like the API's: "experience[0].company"), and its bullets. */
export function useTimelineEntryEditorViewModel<T>({ config, index, entry, errors, onChange }: TimelineEntryEditorProps<T>) {
  const name = `${config.itemName} ${index + 1}`
  const prefix = `${config.key}[${index}]`
  const errorAt = (field: string) => errors[`${prefix}.${field}`]
  const set = (patch: Partial<TimelineEntry>) => onChange({ ...entry, ...patch })
  return {
    ongoingId: useId(),
    name,
    legend: name.charAt(0).toUpperCase() + name.slice(1),
    titleLabel: config.titleLabel,
    organizationLabel: config.organizationLabel,
    errors: { title: errorAt('title'), organization: errorAt(config.organizationKey), location: errorAt('location'), start: errorAt('start'), end: errorAt('end'), bullets: errorAt('bullets') },
    bulletError: (i: number) => errors[`${prefix}.bullets[${i}]`],
    ongoing: entry.end === null,
    setTitle: (title: string) => set({ title }),
    setOrganization: (organization: string) => set({ organization }),
    setLocation: (location: string) => set({ location }),
    setStart: (start: string) => set({ start }),
    setEnd: (end: string) => set({ end }),
    // Unticking "Ongoing" ends it where it started; the admin moves the end from there.
    setOngoing: (ongoing: boolean) => set({ end: ongoing ? null : entry.start }),
    setBullets: (bullets: string[]) => set({ bullets }),
  }
}
