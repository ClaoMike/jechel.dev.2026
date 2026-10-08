import { expect, test } from '@playwright/test'

test('home page greets with the first name from the database', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: "Hi, I'm Claudiu" })).toBeVisible()
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
