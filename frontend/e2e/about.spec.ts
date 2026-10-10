import { expect, test, type Page } from '@playwright/test'

test('visitors see the About Me page from the API, without edit buttons', async ({ page }) => {
  await page.goto('/about')

  await expect(page.getByRole('region', { name: 'Skills' }).getByRole('listitem').first()).toBeVisible()
  for (const name of ["Where I've been", 'Work experience', 'Education', 'Academic papers', 'Qualifications']) {
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: /^Edit/ })).toHaveCount(0)
})

test('the API keeps the About Me page admin-only to change', async ({ request }) => {
  const page = await (await request.get('/api/about')).json()

  expect((await request.put('/api/about', { data: page })).status()).toBe(401)
})

// The real Google sign-in can't run in automated tests, so the admin session and the save are faked.
async function asAdmin(page: Page) {
  const saved: unknown[] = []
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { email: 'admin@example.com', name: 'Admin', pictureUrl: null, sessionExpiresInSeconds: 600 } }),
  )
  await page.route('**/api/about', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    const body = route.request().postDataJSON()
    saved.push(body)
    return route.fulfill({ json: body })
  })
  return saved
}

test('the admin adds a role with bullet points', async ({ page }) => {
  const saved = await asAdmin(page)
  await page.goto('/about')

  await page.getByRole('button', { name: 'Edit Work experience' }).click()
  await page.getByRole('button', { name: 'Add role' }).click()
  const role = page.getByRole('group', { name: 'Role 1' })
  await role.getByLabel('Job title', { exact: true }).fill('Founder')
  await role.getByLabel('Company', { exact: true }).fill('Next Thing')
  await role.getByLabel('Start month', { exact: true }).selectOption('3')
  await role.getByLabel('Start year', { exact: true }).fill('2099')
  await role.getByLabel('Bullet point 1', { exact: true }).fill('Starting something new')
  await page.getByRole('button', { name: 'Save' }).click()

  const experience = page.getByRole('region', { name: 'Work experience' })
  await expect(experience.getByRole('heading', { name: 'Founder' })).toBeVisible()
  await expect(experience.getByText('Upcoming')).toBeVisible()
  await expect(experience.getByText('Starting something new')).toBeVisible()
  expect(saved).toHaveLength(1)
})

test('the admin adds a skill to the timeline', async ({ page }) => {
  const saved = await asAdmin(page)
  await page.goto('/about')

  await page.getByRole('button', { name: 'Edit Skills' }).click()
  await page.getByRole('button', { name: 'Add skill' }).click()
  const added = page.getByRole('group', { name: /^Skill \d+$/ }).last()
  await added.getByLabel('Skill', { exact: true }).fill('Rust')
  await added.getByLabel('From year', { exact: true }).fill('2021')
  await added.getByRole('checkbox', { name: 'Personal' }).check()
  await page.getByRole('button', { name: 'Save' }).click()

  const row = page.getByRole('region', { name: 'Skills' }).locator('.skill-row').filter({ hasText: 'Rust' })
  await expect(row).toContainText('years')
  await row.locator('.skill-bar').hover()
  await expect(row.getByRole('tooltip')).toBeVisible()
  await expect(row.getByRole('tooltip')).toContainText('Work, Personal')
  expect(saved).toHaveLength(1)
})

test('the admin uploads a photo, sent as a multipart form', async ({ page }) => {
  const saved = await asAdmin(page)
  let upload: { contentType: string; body: string } | null = null
  // The real API would refuse the faked session, so the upload is answered here.
  await page.route('**/api/files/photo', (route) => {
    upload = { contentType: route.request().headers()['content-type'], body: route.request().postDataBuffer()!.toString('latin1') }
    return route.fulfill({ json: { url: '/favicon.svg', fileName: 'photo.webp' } })
  })
  await page.goto('/about')

  await page.getByRole('button', { name: 'Edit Photo and links' }).click()
  await page.getByLabel('Photo file').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: Buffer.from('fake png') })
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible()
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByRole('img', { name: 'Claudiu Jechel' })).toHaveAttribute('src', '/favicon.svg')
  expect(upload!.contentType).toMatch(/^multipart\/form-data; boundary=/)
  expect(upload!.body).toContain('name="file"; filename="me.png"')
  expect(saved).toHaveLength(1)
})

test('the admin pins a city on the map', async ({ page }) => {
  const saved = await asAdmin(page)
  await page.route('**/api/places/search**', (route) =>
    route.fulfill({ json: [{ id: 2643123, name: 'Manchester', region: 'England', country: 'United Kingdom', latitude: 53.481, longitude: -2.237, population: 568996 }] }),
  )
  await page.goto('/about')

  await page.getByRole('button', { name: "Edit Where I've been" }).click()
  await page.getByLabel('Add a city').fill('manch')
  await page.getByRole('button', { name: 'Manchester, England, United Kingdom' }).click()
  const popup = page.getByRole('dialog', { name: 'Manchester, England, United Kingdom' })
  await popup.getByRole('checkbox', { name: 'Studied' }).check()
  await popup.getByLabel('Studied: note (optional)').fill('BSc at [The University of Manchester](https://www.manchester.ac.uk)')
  await popup.getByRole('button', { name: 'Add to map' }).click()
  await page.getByRole('button', { name: 'Save' }).click()

  const map = page.getByRole('region', { name: "Where I've been" })
  await map.getByRole('button', { name: /^Manchester, England, United Kingdom\./ }).hover()
  await expect(map.getByRole('link', { name: 'The University of Manchester' })).toHaveAttribute('href', 'https://www.manchester.ac.uk')
  expect(saved).toHaveLength(1)
})
