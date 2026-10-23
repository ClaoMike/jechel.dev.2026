import { expect, test, viceMotion } from './fixtures.ts'

// The theme switch, and Vice's button that hides the page to show the scene behind it.

type Page = import('@playwright/test').Page
const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme)
/** Picks a theme as a visitor does: a press on its icon. */
const pick = (page: Page, name: string) =>
  page
    .getByRole('group', { name: 'Theme' })
    .locator('label')
    .filter({ has: page.getByRole('radio', { name }) })
    .click()

/** Vice, picked: it stays, even where it draws slowly (a device without a graphics card, like CI's, starts in light or dark). */
const inVice = (page: Page) => page.addInitScript(() => localStorage.setItem('theme', 'vice'))

test('opens in Vice where the device can draw it (light or dark otherwise), and keeps the theme picked, also after a reload', async ({ page }) => {
  await page.goto('/')
  const opened = await theme(page)
  expect(['vice', 'dark', 'light']).toContain(opened)
  await expect(page.getByRole('radio', { name: `${opened![0].toUpperCase()}${opened!.slice(1)} mode` })).toBeChecked()

  for (const [name, value] of [
    ['Dark mode', 'dark'],
    ['Light mode', 'light'],
  ] as const) {
    await pick(page, name)
    await expect(page.getByRole('radio', { name })).toBeChecked()
    await expect.poll(() => theme(page)).toBe(value)
    await page.reload()
    await expect(page.getByRole('radio', { name })).toBeChecked()
    expect(await theme(page)).toBe(value)
  }
})

test('the page and the theme look different: the background changes with it', async ({ page }) => {
  await page.goto('/about')
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor + getComputedStyle(document.body).backgroundImage)
  await pick(page, 'Dark mode')
  await expect.poll(() => theme(page)).toBe('dark')
  const dark = await background()
  await pick(page, 'Light mode')
  await expect.poll(() => theme(page)).toBe('light')
  await expect.poll(background).not.toBe(dark)
})

test.describe('Vice', () => {
  test.use(viceMotion)

  test('hides the page to show the scene, and brings it back with the button or Escape', async ({ page }) => {
    await inVice(page)
    await page.goto('/')
    const main = page.locator('main.page')
    await page.getByRole('button', { name: 'Hide page' }).click()
    await expect(page.getByRole('button', { name: 'Show page' })).toBeVisible()
    await expect(main).toHaveAttribute('inert', '')
    await page.getByRole('button', { name: 'Show page' }).click()
    await expect(main).not.toHaveAttribute('inert')

    await page.getByRole('button', { name: 'Hide page' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Hide page' })).toBeVisible()
    await expect(main).not.toHaveAttribute('inert')
  })

  test('the other themes have no Hide page button', async ({ page }) => {
    await page.goto('/')
    await pick(page, 'Vice mode')
    await expect(page.getByRole('button', { name: 'Hide page' })).toBeVisible()
    await pick(page, 'Dark mode')
    await expect(page.getByRole('button', { name: 'Hide page' })).toHaveCount(0)
  })
})
