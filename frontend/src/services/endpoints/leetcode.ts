/** LeetCode stats for the About Me page's "Problem solving" section. */

import { http } from '../http'

/** A number per difficulty; `all` is their sum. */
export interface DifficultyCounts {
  all: number
  easy: number
  medium: number
  hard: number
}

export interface LeetCodeStats {
  /** As LeetCode spells it. */
  username: string
  solved: DifficultyCounts
  /** Problems on LeetCode. */
  total: DifficultyCounts
  /** When the API last got them from LeetCode (it keeps them for a few hours). */
  fetchedAt: string
}

export const leetcodeEndpoints = {
  /**
   * Public. The stats of the LeetCode user set on the About Me page, or null when none is set.
   * Rejects with an ApiError: 404 when LeetCode has no such user, 503 when it can't be reached.
   */
  async get(signal?: AbortSignal): Promise<LeetCodeStats | null> {
    const response = await http.get<LeetCodeStats>('/api/leetcode', { signal })
    return response.status === 204 ? null : response.data
  },
}
