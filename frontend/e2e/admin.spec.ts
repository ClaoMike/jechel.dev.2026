import { expect, test } from '@playwright/test'

test('admin page shows the Google sign-in button', async ({ page }) => {
  await page.goto('/admin')

  const button = page.getByRole('link', { name: 'Sign in with Google' })
  await expect(button).toBeVisible()
  await expect(button).toHaveAttribute('href', '/api/auth/login?returnUrl=%2F')
})

test('admin page explains a rejected Google account', async ({ page }) => {
  await page.goto('/admin?error=not_authorized')

  await expect(page.getByRole('alert')).toContainText('not allowed')
})

test('the API reports anonymous visitors as signed out', async ({ request }) => {
  const response = await request.get('/api/auth/me')

  expect(response.status()).toBe(401)
})

// The real Google round-trip can't run in automated tests, so this fakes the
// session the API would return after a successful Google sign-in.
test('a signed-in admin is sent from /admin to the home page', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { email: 'admin@example.com', name: 'Admin', pictureUrl: null, sessionExpiresInSeconds: 600 } }),
  )

  await page.goto('/admin')

  await expect(page).toHaveURL('/')
  await expect(page.getByText('Signed in as admin@example.com')).toBeVisible()
  await expect(page.getByRole('heading', { name: "Hi, I'm Claudiu" })).toBeVisible()
})
