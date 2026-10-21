import { useState, type KeyboardEvent } from 'react'
import { hasPlatform, PLATFORM_PRESETS } from '../appOptions'

export interface PlatformsEditorProps {
  value: string[]
  onChange: (platforms: string[]) => void
  error?: string
}

/** The common platforms and any others added (as toggles), and a box to add another (once, whatever its case). */
export function usePlatformsEditorViewModel({ value, onChange }: PlatformsEditorProps) {
  const [own, setOwn] = useState('')
  const custom = value.filter((p) => !PLATFORM_PRESETS.some((preset) => preset.toLowerCase() === p.toLowerCase()))

  function addOwn() {
    const platform = own.trim()
    if (platform && !hasPlatform(value, platform)) onChange([...value, platform])
    setOwn('')
  }

  return {
    platforms: [...PLATFORM_PRESETS, ...custom].map((platform) => ({
      name: platform,
      on: hasPlatform(value, platform),
      toggle: () => onChange(hasPlatform(value, platform) ? value.filter((p) => p.toLowerCase() !== platform.toLowerCase()) : [...value, platform]),
    })),
    own,
    setOwn,
    addOwn,
    // Enter adds it instead of submitting the app's form.
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        addOwn()
      }
    },
  }
}
