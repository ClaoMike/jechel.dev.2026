import { expect, test, type Page } from '@playwright/test'

const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs='

// Stands in for the Apps API, so tests don't depend on what's saved.
async function stubApps(page: Page) {
  const categories = [
    { id: 1, name: 'Mobile app' },
    { id: 2, name: 'Website' },
  ]
  const apps = [
    {
      id: 1,
      title: 'Portfolio',
      description: 'This site.',
      categories: [categories[1]],
      platforms: ['Web'],
      links: [{ label: 'the web', url: 'https://example.com' }],
      media: [{ url: pixel, kind: 'image' }, { url: pixel, kind: 'image' }],
      createdAt: '2026-10-01T00:00:00Z',
    },
  ]
  const created: unknown[] = []
  await page.route('**/api/apps?*', (route) => route.fulfill({ json: { items: apps, page: 1, pageSize: 9, totalCount: apps.length } }))
  await page.route('**/api/apps/categories', (route) => route.fulfill({ json: categories }))
  await page.route('**/api/apps', async (route) => {
    const body = route.request().postDataJSON()
    created.push(body)
    const { categoryIds, ...rest } = body
    const app = { ...rest, categories: categories.filter((c) => categoryIds.includes(c.id)), id: 2, createdAt: new Date().toISOString() }
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
  await expect(popup.getByText('Website')).toBeVisible()
  await expect(popup.getByRole('link', { name: 'Check it on the web' })).toHaveAttribute('href', 'https://example.com')
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
  await form.getByRole('button', { name: 'Mobile app' }).click()
  await form.getByLabel('Image or video files').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: Buffer.from('png') })
  await expect(form.getByRole('list', { name: 'Images and videos' }).getByRole('listitem')).toHaveCount(1)
  await form.getByRole('button', { name: 'Add app' }).click()

  await expect(page.getByRole('dialog', { name: 'Chess clock' })).toBeVisible()
  expect(uploadType).toMatch(/^multipart\/form-data/)
  await expect(page.getByRole('dialog', { name: 'Chess clock' }).getByText('Mobile app')).toBeVisible()
  expect(created).toEqual([{ title: 'Chess clock', description: '', categoryIds: [1], platforms: [], links: [], media: [{ url: pixel, kind: 'image' }] }])
})

test('the admin reorders images by dragging them', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { email: 'admin@example.com', name: 'Admin', pictureUrl: null, sessionExpiresInSeconds: 600 } }),
  )
  const svg = (color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="${color}"/></svg>`)}`
  const media = ['red', 'green', 'blue'].map((color) => ({ url: svg(color), kind: 'image' }))
  const app = { id: 1, title: 'Colours', description: '', categories: [], platforms: [], links: [], media, createdAt: '2026-10-01T00:00:00Z' }
  let saved: { media: { url: string }[] } | null = null
  await page.route('**/api/apps/categories', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/apps?*', (route) => route.fulfill({ json: { items: [app], page: 1, pageSize: 8, totalCount: 1 } }))
  await page.route('**/api/apps/1', (route) => {
    saved = route.request().postDataJSON()
    return route.fulfill({ json: { ...app, ...saved } })
  })
  await page.goto('/apps')
  await page.getByRole('button', { name: 'Colours' }).click()
  await page.getByRole('button', { name: 'Edit' }).click()

  // Drag the third tile (blue) onto the first.
  const tiles = page.getByRole('list', { name: 'Images and videos' }).getByRole('listitem')
  await tiles.last().scrollIntoViewIfNeeded()
  const from = (await tiles.nth(2).boundingBox())!
  const to = (await tiles.nth(0).boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + 30)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 - 20, from.y + 30, { steps: 5 })
  await page.mouse.move(to.x + to.width / 2, to.y + 30, { steps: 15 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByRole('dialog', { name: 'Colours' })).toBeVisible()
  expect(saved!.media.map((m) => decodeURIComponent(m.url).match(/fill="(\w+)"/)![1])).toEqual(['blue', 'red', 'green'])
})
