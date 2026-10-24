import { expect, test } from './fixtures.ts'

// Moving around the site: the tabs, the browser's own back and forward, addresses typed in.

const tabs = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Sections' })
const SECTIONS = [
  ["What's new?", '/'],
  ['Apps', '/apps'],
  ['YouTube', '/youtube'],
  ['About Me', '/about'],
  ['Contact', '/contact'],
] as const

test('the tabs go to each section, marking the one on show', async ({ page }) => {
  await page.goto('/')
  await expect(tabs(page).getByRole('link')).toHaveText(SECTIONS.map(([name]) => name))
  for (const [name, path] of [...SECTIONS.slice(1), SECTIONS[0]]) {
    await tabs(page).getByRole('link', { name }).click()
    await expect(page).toHaveURL(path)
    await expect(tabs(page).getByRole('link', { name })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('main')).not.toBeEmpty()
  }
})

test('back and forward move between the sections visited, the page following', async ({ page }) => {
  await page.goto('/apps')
  await tabs(page).getByRole('link', { name: 'About Me' }).click()
  await expect(page.getByRole('heading', { name: 'About Me', level: 2 })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL('/apps')
  await expect(page.getByRole('list', { name: 'Apps' })).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL('/about')
  await expect(page.getByRole('heading', { name: 'About Me', level: 2 })).toBeVisible()
})

test('the site name goes home', async ({ page }) => {
  await page.goto('/contact')
  await page.getByRole('link', { name: 'jechel.dev' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('region', { name: "What's new?" })).toBeVisible()
})

test('an address that leads nowhere goes home', async ({ page }) => {
  await page.goto('/no-such-page')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('region', { name: "What's new?" })).toBeVisible()
})

for (const path of ['/engagement', '/community', '/notifications', '/settings', '/features']) {
  test(`the admin's ${path} isn't there for visitors: it goes home`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveURL('/')
    await expect(tabs(page).getByRole('link', { name: 'Settings' })).toHaveCount(0)
  })
}

test("the terms have a page of their own, for anyone to read, without the admin's Edit", async ({ page }) => {
  await page.goto('/terms')
  await expect(page.getByRole('heading', { name: 'Terms and Conditions', level: 2 })).toBeVisible()
  await expect(page.getByRole('heading', { name: '1. Who runs this website' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit the terms' })).toHaveCount(0)
})

test('a page reloaded stays where it was', async ({ page }) => {
  await page.goto('/youtube?page=2')
  await expect(page.getByText('Page 2 of 2')).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL('/youtube?page=2')
  await expect(page.getByText('Page 2 of 2')).toBeVisible()
})
