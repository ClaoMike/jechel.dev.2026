import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { api, ApiError, type LeetCodeStats, type ProblemSolving } from '@/shared/api'
import { LEETCODE } from '@/test/fixtures/site'
import { forever, renderView, textOf } from '@/test/render'
import { ProblemSolvingSection } from './ProblemSolvingSection/ProblemSolvingSection'

const VALUE: ProblemSolving = { leetCodeUsername: 'jechel', neetCodeLists: ['blind75', 'neetcode150'] }

function renderProblemSolving({
  value = VALUE,
  canEdit = false,
  onSave = vi.fn(async () => {}),
  stats,
}: { value?: ProblemSolving; canEdit?: boolean; onSave?: (v: ProblemSolving) => Promise<void>; stats?: () => Promise<LeetCodeStats | null> } = {}) {
  const get = vi.spyOn(api.leetcode, 'get').mockImplementation(stats ?? (async () => structuredClone(LEETCODE)))
  return { get, view: renderView(<ProblemSolvingSection value={value} canEdit={canEdit} onSave={onSave} />) }
}

const profile = () => page.getByRole('link', { name: /^LeetCode/ })
const difficulties = () => page.getByRole('list', { name: 'Solved by difficulty' })
const form = () => page.getByRole('form', { name: 'Edit Problem solving' })

describe('Problem solving, for a visitor', () => {
  it('shows the LeetCode stats: a link to the profile, the total in a ring, and each difficulty', async () => {
    const { view } = renderProblemSolving()
    await view
    await expect.element(profile()).toHaveAttribute('href', 'https://leetcode.com/u/jechel/')
    await expect.element(profile()).toHaveAttribute('target', '_blank')
    await expect.poll(() => textOf(profile())).toBe('LeetCode@jechel')
    await expect.poll(() => document.querySelector('.leetcode-ring-label')?.textContent).toBe('420solved')
    await expect.poll(() => textOf(difficulties())).toBe('Easy180 / 850Medium200 / 1,780Hard40 / 770')
    const bars = [...difficulties().element().querySelectorAll<HTMLElement>('.leetcode-bar > span')].map((bar) => Number.parseFloat(bar.style.width))
    expect(bars[0]).toBeCloseTo((180 / 850) * 100, 3)
    expect(bars[1]).toBeCloseTo((200 / 1780) * 100, 3)
    expect(bars[2]).toBeCloseTo((40 / 770) * 100, 3)
    // One arc per difficulty in the ring.
    expect(document.querySelectorAll('.leetcode-ring-segment')).toHaveLength(3)
    await expect.element(page.getByText(/^As of/)).not.toBeInTheDocument()
  })

  it('shows the username as LeetCode spells it, and the NeetCode lists completed', async () => {
    const { view } = renderProblemSolving({ stats: async () => ({ ...LEETCODE, username: 'Jechel' }) })
    await view
    await expect.poll(() => textOf(profile())).toBe('LeetCode@Jechel')
    await expect.poll(() => textOf(page.getByRole('list', { name: 'NeetCode lists completed' }))).toBe('Blind 75NeetCode 150')
  })

  it('says when the stats are from: stats older than two days mean LeetCode has not answered since', async () => {
    const { view } = renderProblemSolving({ stats: async () => ({ ...LEETCODE, fetchedAt: '2026-01-05T10:00:00Z' }) })
    await view
    await expect.element(page.getByText('As of 5 Jan 2026.')).toBeVisible()
  })

  it('shows the stats’ shape while they load', async () => {
    const { view } = renderProblemSolving({ stats: () => forever() })
    await view
    await expect.poll(() => textOf(page.getByRole('status'))).toBe('Loading LeetCode stats…')
    await expect.element(profile()).toBeVisible()
  })

  it("says the stats can't be loaded, and loads them on retry", async () => {
    const { view, get } = renderProblemSolving({ stats: vi.fn().mockRejectedValueOnce(new ApiError('/api/leetcode', 502)).mockResolvedValue(structuredClone(LEETCODE)) })
    await view
    await expect.poll(() => textOf(page.getByRole('alert'))).toContain("LeetCode stats can't be loaded right now.")
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect.element(difficulties()).toBeVisible()
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('treats "no stats" from the API like stats that can not be loaded', async () => {
    const { view } = renderProblemSolving({ stats: async () => null })
    await view
    await expect.poll(() => textOf(page.getByRole('alert'))).toContain("LeetCode stats can't be loaded right now.")
  })

  it("hides the card from visitors when LeetCode doesn't know the user, keeping the lists", async () => {
    const { view } = renderProblemSolving({ stats: async () => Promise.reject(new ApiError('/api/leetcode', 404)) })
    await view
    await expect.element(page.getByRole('list', { name: 'NeetCode lists completed' })).toBeVisible()
    await expect.poll(() => document.querySelector('.leetcode')).toBeNull()
    await expect.element(page.getByText(/LeetCode has no user/)).not.toBeInTheDocument()
  })

  it('shows only what there is: no username, or no lists', async () => {
    const first = renderProblemSolving({ value: { leetCodeUsername: '', neetCodeLists: ['neetcode250'] } })
    await (await first.view).unmount()
    expect(first.get).not.toHaveBeenCalled()
    const { view } = renderProblemSolving({ value: { leetCodeUsername: 'jechel', neetCodeLists: [] } })
    await view
    await expect.element(difficulties()).toBeVisible()
    await expect.element(page.getByRole('list', { name: 'NeetCode lists completed' })).not.toBeInTheDocument()
  })

  it('says so when there is nothing at all', async () => {
    const { view, get } = renderProblemSolving({ value: { leetCodeUsername: '', neetCodeLists: [] } })
    await view
    await expect.element(page.getByText('Nothing here yet.')).toBeVisible()
    expect(get).not.toHaveBeenCalled()
  })
})

describe('Problem solving, for the admin', () => {
  it("tells the admin when LeetCode doesn't know the username", async () => {
    const { view } = renderProblemSolving({ canEdit: true, stats: async () => Promise.reject(new ApiError('/api/leetcode', 404)) })
    await view
    await expect.element(page.getByText('LeetCode has no user called jechel. Check the username with Edit.')).toBeVisible()
  })

  it('takes a pasted profile link as the username, toggles the lists, and saves', async () => {
    const onSave = vi.fn(async () => {})
    const { view } = renderProblemSolving({ canEdit: true, onSave })
    await view
    await page.getByRole('button', { name: 'Edit Problem solving' }).click()
    const username = form().getByRole('textbox', { name: 'LeetCode username' })
    await expect.element(username).toHaveAccessibleDescription('As in leetcode.com/u/username (pasting the profile link works too). Leave empty to hide the stats.')
    await username.fill('https://leetcode.com/u/neetcode/')
    await expect.element(username).toHaveValue('neetcode')
    await expect.element(form().getByRole('button', { name: 'Blind 75' })).toHaveAttribute('aria-pressed', 'true')
    await form().getByRole('button', { name: 'Blind 75' }).click()
    await form().getByRole('button', { name: 'NeetCode 250' }).click()
    await expect.element(form().getByRole('button', { name: 'NeetCode 250' })).toHaveAttribute('aria-pressed', 'true')
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith({ leetCodeUsername: 'neetcode', neetCodeLists: ['neetcode150', 'neetcode250'] })
  })

  it("shows the API's errors on the username and the lists", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValue(
        new ApiError('/api/about', 400, { 'problemSolving.leetCodeUsername': ['Too long.'], 'problemSolving.neetCodeLists': ['Unknown list.'], problemSolving: ['Bad section.'] }),
      )
    const { view } = renderProblemSolving({ canEdit: true, onSave })
    await view
    await page.getByRole('button', { name: 'Edit Problem solving' }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    await expect.element(form().getByRole('textbox', { name: 'LeetCode username' })).toHaveAccessibleDescription(/Too long\./)
    await expect.element(form().getByText('Unknown list.')).toBeVisible()
    await expect.element(form().getByText('Bad section.')).toBeVisible()
  })
})
