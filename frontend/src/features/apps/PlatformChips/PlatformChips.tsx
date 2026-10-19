import { usePlatformChipsViewModel } from './PlatformChips.viewModel'

/** "Runs on" and the platforms as chips; nothing without any. */
export function PlatformChips({ platforms }: { platforms: string[] }) {
  const vm = usePlatformChipsViewModel()
  if (platforms.length === 0) return null
  return (
    <div className="app-platforms">
      <span className="app-platforms-label" id={vm.labelId}>
        Runs on
      </span>
      <ul className="chips" aria-labelledby={vm.labelId}>
        {platforms.map((platform) => (
          <li key={platform} className="chip">
            {platform}
          </li>
        ))}
      </ul>
    </div>
  )
}
