import { VIDEOS } from '../data.ts'
import { expect, test } from './fixtures.ts'

// The YouTube page: the channel's videos (from the stand-in for YouTube), newest first, 9 a page.

const videos = (page: import('@playwright/test').Page) => page.getByRole('list', { name: 'Videos' }).getByRole('listitem')

test('shows the newest 9 videos, each linking to YouTube', async ({ page }) => {
  await page.goto('/youtube')
  await expect(videos(page)).toHaveCount(9)
  await expect(videos(page).getByRole('heading')).toHaveText(VIDEOS.slice(0, 9).map((v) => `${v.title} (opens in a new tab)`))
  const first = page.getByRole('link', { name: `${VIDEOS[0].title} (opens in a new tab)` })
  await expect(first).toHaveAttribute('href', `https://www.youtube.com/watch?v=${VIDEOS[0].id}`)
  await expect(first).toHaveAttribute('target', '_blank')
  await expect(videos(page).first().getByText(VIDEOS[0].description)).toBeVisible()
})

test('links to the channel above the videos, in a new tab', async ({ page }) => {
  await page.goto('/youtube')
  const visit = page.getByRole('link', { name: 'Visit my YouTube page' })
  await expect(visit).toHaveAttribute('href', 'https://www.youtube.com/@e2e')
  await expect(visit).toHaveAttribute('target', '_blank')
  await expect(videos(page)).toHaveCount(9)
  expect(await visit.evaluate((link) => !!(link.compareDocumentPosition(document.querySelector('[aria-label="Videos"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
})

test('pages through them: Next, Previous, and the address follows', async ({ page }) => {
  await page.goto('/youtube')
  const pagination = page.getByRole('navigation', { name: 'Pagination' })
  await expect(pagination.getByRole('button', { name: 'Previous' })).toBeDisabled()
  await pagination.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL('/youtube?page=2')
  await expect(pagination.getByText('Page 2 of 2')).toBeVisible()
  await expect(videos(page).getByRole('heading')).toHaveText(VIDEOS.slice(9).map((v) => `${v.title} (opens in a new tab)`))
  await expect(pagination.getByRole('button', { name: 'Next' })).toBeDisabled()

  await pagination.getByRole('button', { name: 'Previous' }).click()
  await expect(page).toHaveURL(/\/youtube(\?page=1)?$/)
  await expect(videos(page)).toHaveCount(9)
})

test('the thumbnails load', async ({ page }) => {
  await page.goto('/youtube')
  const image = videos(page).first().locator('img.fitted-image-main')
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)
})
