import { NEETCODE_LISTS, type NeetCodeList } from '@/shared/api'
import { strings } from '@/shared/i18n'

export const NEETCODE_LIST_LABELS: Record<NeetCodeList, string> = {
  blind75: strings.problemSolving.blind75,
  neetcode150: strings.problemSolving.neetcode150,
  neetcode250: strings.problemSolving.neetcode250,
}

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

export const DIFFICULTY_LABELS: Record<(typeof DIFFICULTIES)[number], string> = {
  easy: strings.problemSolving.easy,
  medium: strings.problemSolving.medium,
  hard: strings.problemSolving.hard,
}

/** Stats older than this mean the API couldn't reach LeetCode since (it refreshes them every 24 hours). */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000

export const leetCodeProfileUrl = (username: string) => `https://leetcode.com/u/${encodeURIComponent(username)}/`

/** A pasted profile link, "https://leetcode.com/u/neetcode/", becomes "neetcode"; anything else stays as typed. */
export function leetCodeUsernameFrom(input: string): string {
  const match = /^\s*(?:https?:\/\/)?(?:www\.)?leetcode\.com\/(?:u\/)?([A-Za-z0-9_-]+)\/?\s*$/i.exec(input)
  return match ? match[1] : input
}

/** Ticks or unticks a list, keeping them in NEETCODE_LISTS order. */
export function toggleList(lists: NeetCodeList[], list: NeetCodeList): NeetCodeList[] {
  const next = lists.includes(list) ? lists.filter((l) => l !== list) : [...lists, list]
  return NEETCODE_LISTS.filter((l) => next.includes(l))
}
