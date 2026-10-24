import { YouTubeIcon } from '../../../components/icons/icons'
import { useYouTubeChannelButtonViewModel } from './YouTubeChannelButton.viewModel'

/** A button to my YouTube channel, in a new tab. Nothing while it loads, or when no channel is set (Settings → YouTube). */
export function YouTubeChannelButton({ label, subscribe = false }: { label: string; subscribe?: boolean }) {
  const vm = useYouTubeChannelButtonViewModel(subscribe)
  if (!vm.href) return null
  return (
    <a className="button button-secondary" href={vm.href} target="_blank" rel="noopener noreferrer">
      <YouTubeIcon />
      {label}
    </a>
  )
}
