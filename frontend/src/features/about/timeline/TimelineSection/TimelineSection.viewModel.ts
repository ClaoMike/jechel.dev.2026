import type { ComponentType } from 'react'
import type { EditorProps } from '../../../../components/fields'
import { toItemView, type TimelineConfig } from '../timeline'

export interface TimelineSectionProps<T> {
  config: TimelineConfig<T>
  /** The section's editor, bound to the same config. */
  editor: ComponentType<EditorProps<T[]>>
  value: T[]
  canEdit: boolean
  onSave: (value: T[]) => Promise<void>
}

/** The entries as the timeline shows them. */
export function useTimelineSectionViewModel<T>({ config, value }: TimelineSectionProps<T>) {
  return { items: value.map((item) => toItemView(config.toEntry(item))) }
}
