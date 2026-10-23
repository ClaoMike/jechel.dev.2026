import { expect, test } from './fixtures.ts'

// What's new (home): the newest of the apps and videos. The setup's apps are newer than the stand-in's videos.

test('shows the newest app, with where it runs and where to get it', async ({ page }) => {
  await page.goto('/')
  const region = page.getByRole('region', { name: "What's new?" })
  const article = region.getByRole('article')
  await expect(article).toHaveCount(1)
  await expect(article.getByText(/^New app/)).toBeVisible()
  await expect(article.getByRole('heading', { level: 3 })).toHaveText(/E2E app/)
  await expect(article.getByRole('list', { name: 'Runs on' })).toBeVisible()
  await expect(article.getByRole('link', { name: 'Check it on Website' })).toHaveAttribute('href', 'https://example.com/')
})
