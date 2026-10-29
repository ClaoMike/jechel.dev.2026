/** YouTube: my channel's videos. */

import { type Page, get, http, post } from '../http'

/** A public video from my channel. */
export interface YouTubeVideo {
  id: string
  title: string
  description: string
  thumbnailUrl: string
  publishedAt: string
  /** The video on youtube.com. */
  url: string
}

/** My channel on YouTube. */
export interface YouTubeChannel {
  /** Its page on youtube.com. */
  url: string
}

export const youtubeEndpoints = {
  /** Public. My channel's page on YouTube, or null when no channel is set. */
  async channel(signal?: AbortSignal): Promise<YouTubeChannel | null> {
    const response = await http.get<YouTubeChannel>('/api/youtube/channel', { signal })
    return response.status === 204 ? null : response.data
  },

  /** Public. Newest first. Rejects with a 503 ApiError when YouTube isn't set up or can't be reached. */
  listVideos(page = 1, pageSize = 9, signal?: AbortSignal): Promise<Page<YouTubeVideo>> {
    return get<Page<YouTubeVideo>>('/api/youtube/videos', { params: { page, pageSize }, signal })
  },

  /**
   * Admin only. Asks YouTube for the videos now (e.g. right after uploading one) instead of within the
   * hour; resolves with how many there are. Rejects with a 503 ApiError when YouTube isn't set up or
   * can't be reached (the saved list stays).
   */
  async refreshVideos(): Promise<number> {
    const { count } = await post<{ count: number }>('/api/youtube/refresh')
    return count
  },
}
