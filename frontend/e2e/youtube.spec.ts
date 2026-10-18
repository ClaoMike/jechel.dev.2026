import { expect, test } from '@playwright/test'

// Stands in for the API's YouTube list, so the test doesn't need a YouTube key.
const videos = Array.from({ length: 11 }, (_, i) => ({
  id: `v${i + 1}`,
  title: `Video ${i + 1}`,
  description: 'A long description. '.repeat(30),
  thumbnailUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
  publishedAt: new Date(Date.UTC(2026, 8, 30 - i)).toISOString(),
  url: `https://www.youtube.com/watch?v=v${i + 1}`,
}))

test('visitors page through the videos, three to a row', async ({ page }) => {
  await page.route('**/api/youtube/videos?*', (route) => {
    const url = new URL(route.request().url())
    const p = Number(url.searchParams.get('page') ?? 1)
    route.fulfill({ json: { items: videos.slice((p - 1) * 9, p * 9), page: p, pageSize: 9, totalCount: videos.length } })
  })
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/youtube')

  const cards = page.getByRole('list', { name: 'Videos' }).getByRole('listitem')
  await expect(cards).toHaveCount(9)
  const [a, b, c, d] = await Promise.all([0, 1, 2, 3].map((i) => cards.nth(i).boundingBox()))
  expect(a!.y).toBeCloseTo(b!.y, 0)
  expect(b!.y).toBeCloseTo(c!.y, 0)
  expect(d!.y).toBeGreaterThan(a!.y)
  // Each card's title is its link, opening YouTube in a new tab.
  await expect(cards.first().getByRole('link', { name: 'Video 1 (opens in a new tab)' })).toHaveAttribute('target', '_blank')

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL(/\?page=2$/)
  await expect(cards).toHaveCount(2)
})
