import { expect, test, type Page } from '@playwright/test'

const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs='

// Stands in for the Apps API, so tests don't depend on what's saved.
async function stubApps(page: Page) {
  const apps = [{ id: 1, title: 'Portfolio', description: 'This site.', media: [{ url: pixel, kind: 'image' }, { url: pixel, kind: 'image' }], createdAt: '2026-10-01T00:00:00Z' }]
  const created: unknown[] = []
  await page.route('**/api/apps?*', (route) => route.fulfill({ json: { items: apps, page: 1, pageSize: 9, totalCount: apps.length } }))
  await page.route('**/api/apps', async (route) => {
    const body = route.request().postDataJSON()
    created.push(body)
    const app = { ...body, id: 2, createdAt: new Date().toISOString() }
    apps.unshift(app)
    return route.fulfill({ status: 201, json: app })
  })
  return created
}

test('visitors open an app and slide through its images', async ({ page }) => {
  await stubApps(page)
  await page.goto('/apps')

  await page.getByRole('button', { name: 'Portfolio' }).click()
  const popup = page.getByRole('dialog', { name: 'Portfolio' })
  await expect(popup.getByText('1 / 2')).toBeVisible()
  await popup.getByRole('button', { name: 'Next' }).click()
  await expect(popup.getByText('2 / 2')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add an app' })).toHaveCount(0)
})

test('the admin adds an app, uploading an image as a multipart form', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { email: 'admin@example.com', name: 'Admin', pictureUrl: null, sessionExpiresInSeconds: 600 } }),
  )
  const created = await stubApps(page)
  let uploadType = ''
  await page.route('**/api/files/app-media', (route) => {
    uploadType = route.request().headers()['content-type'] ?? ''
    return route.fulfill({ json: { url: pixel, fileName: 'shot.png', kind: 'image' } })
  })
  await page.goto('/apps')

  await page.getByRole('button', { name: 'Add an app' }).click()
  const form = page.getByRole('dialog', { name: 'Add an app' })
  await form.getByLabel('Title').fill('Chess clock')
  await form.getByLabel('Image or video files').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: Buffer.from('png') })
  await expect(form.getByRole('list', { name: 'Images and videos' }).getByRole('listitem')).toHaveCount(1)
  await form.getByRole('button', { name: 'Add app' }).click()

  await expect(page.getByRole('dialog', { name: 'Chess clock' })).toBeVisible()
  expect(uploadType).toMatch(/^multipart\/form-data/)
  expect(created).toEqual([{ title: 'Chess clock', description: '', media: [{ url: pixel, kind: 'image' }] }])
})
