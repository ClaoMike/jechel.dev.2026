import { useGetYouTubeChannelQuery } from '../../../store/api/appsApi'

/** Where the button goes: my channel's page, or with `subscribe` YouTube's "Subscribe?" prompt on it. Null until it's known, or when no channel is set. */
export function useYouTubeChannelButtonViewModel(subscribe: boolean) {
  const url = useGetYouTubeChannelQuery().data?.url
  return { href: url ? (subscribe ? `${url}?sub_confirmation=1` : url) : null }
}
