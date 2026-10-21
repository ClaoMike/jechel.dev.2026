import { useState } from 'react'
import { failureOf } from '../../../services/api'
import { useRefreshVideosMutation } from '../../../store/api/appsApi'

/** What the last refresh said. */
export interface RefreshResult {
  ok: boolean
  message: string
}

/** Asks YouTube for the videos now; the grid (and What's new?) load them again. */
export function useRefreshVideosButtonViewModel() {
  const [refreshVideos, { isLoading }] = useRefreshVideosMutation()
  const [result, setResult] = useState<RefreshResult | null>(null)

  async function refresh() {
    setResult(null)
    try {
      const count = await refreshVideos().unwrap()
      setResult({ ok: true, message: `Up to date: ${count} ${count === 1 ? 'video' : 'videos'} on YouTube.` })
    } catch (error) {
      const { status } = failureOf(error)
      setResult({
        ok: false,
        message: status === 503 ? "YouTube can't be reached right now, or isn't set up (Settings). The videos shown are the last ones saved." : "That didn't work. Please try again.",
      })
    }
  }

  return { busy: isLoading, result, refresh: () => void refresh() }
}
