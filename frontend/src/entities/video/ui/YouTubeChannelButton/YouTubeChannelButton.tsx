import { YouTubeIcon } from '@/shared/ui/icons'
import { useGetYouTubeChannelQuery } from '../../api/videosApi'

/** A button to my YouTube channel, in a new tab. Nothing while it loads, or when no channel is set (Settings → YouTube). */
export function YouTubeChannelButton({ label, subscribe = false }: { label: string; subscribe?: boolean }) {
  const url = useGetYouTubeChannelQuery().data?.url
  if (!url) return null
  // With `subscribe`, YouTube's "Subscribe?" prompt on the channel's page.
  const href = subscribe ? `${url}?sub_confirmation=1` : url
  return (
    <a className="button button-secondary" href={href} target="_blank" rel="noopener noreferrer">
      <YouTubeIcon />
      {label}
    </a>
  )
}
