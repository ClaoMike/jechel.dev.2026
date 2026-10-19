import { useState } from 'react'
import { hasPlatform, PLATFORM_PRESETS } from '../appOptions'

/** The app's categories as toggles, kept in the categories' order. */
export function useCategoryPickerViewModel(categoryIds: number[], value: number[], onChange: (ids: number[]) => void) {
  return {
    selected: (id: number) => value.includes(id),
    toggle: (id: number) => {
      const next = value.includes(id) ? value.filter((v) => v !== id) : [...value, id]
      onChange(categoryIds.filter((c) => next.includes(c)))
    },
  }
}

/** The common platforms and any others added, and a box to add another. */
export function usePlatformsEditorViewModel(value: string[], onChange: (platforms: string[]) => void) {
  const [own, setOwn] = useState('')
  const custom = value.filter((p) => !PLATFORM_PRESETS.some((preset) => preset.toLowerCase() === p.toLowerCase()))

  function addOwn() {
    const platform = own.trim()
    if (platform && !hasPlatform(value, platform)) onChange([...value, platform])
    setOwn('')
  }

  return {
    platforms: [...PLATFORM_PRESETS, ...custom].map((platform) => ({ name: platform, on: hasPlatform(value, platform) })),
    toggle: (platform: string) => onChange(hasPlatform(value, platform) ? value.filter((p) => p.toLowerCase() !== platform.toLowerCase()) : [...value, platform]),
    own,
    setOwn,
    addOwn,
  }
}
