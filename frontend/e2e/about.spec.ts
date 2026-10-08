import { expect, test, type Page } from '@playwright/test'

test('visitors see the About Me page from the API, without edit buttons', async ({ page }) => {
  await page.goto('/about')

  await expect(page.getByRole('region', { name: 'Skills' }).getByRole('listitem').first()).toBeVisible()
  for (const name of ['Work experience', 'Education', 'Academic papers', 'Qualifications']) {
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

test('the admin edits the skills chart', async ({ page }) => {
  const saved = await asAdmin(page)
  await page.goto('/about')

  await page.getByRole('button', { name: 'Edit Skills' }).click()
  await page.getByRole('button', { name: 'Add skill' }).click()
  const skills = page.getByRole('group', { name: /^Skill \d+$/ })
  const added = skills.last()
  await added.getByLabel('Skill', { exact: true }).fill('Rust')
  await added.getByLabel('Level (0–100)', { exact: true }).fill('42')
  await page.getByRole('button', { name: 'Save' }).click()

  const row = page.getByRole('region', { name: 'Skills' }).getByRole('listitem').filter({ hasText: 'Rust' })
  await expect(row).toContainText('42 out of 100')
  await expect(row.locator('.skill-bar')).toHaveAttribute('style', /width: 42%/)
  expect(saved).toHaveLength(1)
})
