import { useState, type KeyboardEvent } from 'react'
import { AddButton, TextField } from '../../../components/fields'
import { hasPlatform, PLATFORM_PRESETS } from '../appOptions'
import { strings } from '../../../strings'

export interface PlatformsEditorProps {
  value: string[]
  onChange: (platforms: string[]) => void
  error?: string
}

/** What the app runs on: one click for the common ones (and any others added), or type another (once, whatever its case). */
export function PlatformsEditor({ value, onChange, error }: PlatformsEditorProps) {
  const [own, setOwn] = useState('')
  const custom = value.filter((p) => !PLATFORM_PRESETS.some((preset) => preset.toLowerCase() === p.toLowerCase()))

  function addOwn() {
    const platform = own.trim()
    if (platform && !hasPlatform(value, platform)) onChange([...value, platform])
    setOwn('')
  }

  const platforms = [...PLATFORM_PRESETS, ...custom].map((platform) => ({
    name: platform,
    on: hasPlatform(value, platform),
    toggle: () => onChange(hasPlatform(value, platform) ? value.filter((p) => p.toLowerCase() !== platform.toLowerCase()) : [...value, platform]),
  }))

  // Enter adds it instead of submitting the app's form.
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      addOwn()
    }
  }
  return (
    <fieldset className="app-field">
      <legend className="field-label">{strings.platformsEditor.runs}</legend>
      <div className="licence-toggles">
        {platforms.map((platform) => (
          <button key={platform.name} type="button" className="licence-toggle" aria-pressed={platform.on} onClick={platform.toggle}>
            {platform.name}
          </button>
        ))}
      </div>
      <div className="app-inline-add" onKeyDown={onKeyDown}>
        <TextField label={strings.platformsEditor.anotherPlatform} value={own} onChange={setOwn} placeholder={strings.platformsEditor.eGMetaQuest} />
        <AddButton onClick={addOwn}>{strings.platformsEditor.addPlatform}</AddButton>
      </div>
      {error && <p className="field-error">{error}</p>}
    </fieldset>
  )
}
