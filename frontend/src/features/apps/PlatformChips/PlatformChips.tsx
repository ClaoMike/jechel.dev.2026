import { useId } from 'react'
import { strings } from '../../../strings'

/** "Runs on" and the platforms as chips; nothing without any. */
export function PlatformChips({ platforms }: { platforms: string[] }) {
  // Names the list "Runs on".
  const labelId = `${useId()}-platforms`
  if (platforms.length === 0) return null
  return (
    <div className="app-platforms">
      <span className="app-platforms-label" id={labelId}>
        {strings.platformChips.runs}
      </span>
      <ul className="chips" aria-labelledby={labelId}>
        {platforms.map((platform) => (
          <li key={platform} className="chip">
            {platform}
          </li>
        ))}
      </ul>
    </div>
  )
}
