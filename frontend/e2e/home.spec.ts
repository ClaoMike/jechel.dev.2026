import { expect, test } from '@playwright/test'

test('home page greets with the first name from the database', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: "Hi, I'm Claudiu" })).toBeVisible()
})
