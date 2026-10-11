import { expect, test } from '@playwright/test'

test('home page shows the site name', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'jechel.dev' })).toBeVisible()
})

test('the tabs switch between sections', async ({ page }) => {
  await page.goto('/')
  const tabs = page.getByRole('navigation', { name: 'Sections' })

  await expect(tabs.getByRole('link')).toHaveText(["What's new?", 'Apps', 'YouTube', 'About Me', 'Contact'])
  await expect(tabs.getByRole('link', { name: "What's new?" })).toHaveAttribute('aria-current', 'page')

  for (const [tab, url] of [['Apps', '/apps'], ['YouTube', '/youtube'], ['About Me', '/about'], ['Contact', '/contact']] as const) {
    await tabs.getByRole('link', { name: tab }).click()
    await expect(page).toHaveURL(url)
    await expect(tabs.getByRole('link', { name: tab })).toHaveAttribute('aria-current', 'page')
  }
})

test("What's new shows the newest video, with YouTube's player and its full description", async ({ page }) => {
  // Stands in for the API: an app from September and a video from October.
  await page.route('**/api/apps?*', (route) =>
    route.fulfill({
      json: { items: [{ id: 1, title: 'Older app', description: '', categories: [], platforms: [], links: [], media: [], createdAt: '2026-09-01T00:00:00Z' }], page: 1, pageSize: 1, totalCount: 1 },
    }),
  )
  await page.route('**/api/youtube/videos?*', (route) =>
    route.fulfill({
      json: {
        items: [{ id: 'abc123', title: 'Newest video', description: 'All of it. More at https://example.com', thumbnailUrl: '', publishedAt: '2026-10-05T00:00:00Z', url: 'https://www.youtube.com/watch?v=abc123' }],
        page: 1,
        pageSize: 1,
        totalCount: 1,
      },
    }),
  )
  await page.goto('/')

  const item = page.getByRole('article')
  await expect(item.getByRole('heading', { name: 'Newest video' })).toBeVisible()
  await expect(item.locator('iframe')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/abc123')
  await expect(item.getByRole('link', { name: 'https://example.com' })).toBeVisible()
})
