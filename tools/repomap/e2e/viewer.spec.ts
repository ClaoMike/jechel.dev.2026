import { expect, test, type Page } from '@playwright/test'

function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

const footer = (page: Page) => page.locator('.sidebar-footer')

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('sidebar')).toBeVisible()
  await expect(footer(page)).toContainText('253/253 nodes')
})

test('renders the demo graph in 3D without errors', async ({ page }) => {
  const errors = watchErrors(page)
  await expect(page.locator('.scene canvas').first()).toBeVisible()
  await expect(page.locator('.repo')).toContainText('bookshelf (demo)')
  await page.waitForTimeout(500)
  expect(errors).toEqual([])
})

test('presets filter nodes and edges without moving anything', async ({ page }) => {
  await page.getByTestId('preset-architecture').click()
  await expect(page.getByTestId('preset-architecture')).toHaveClass(/active/)
  await expect(footer(page)).not.toContainText('253/253 nodes')
  await expect(page.getByTestId('role-test')).toContainText('0/')
  await page.getByTestId('preset-everything').click()
  await expect(footer(page)).toContainText('253/253 nodes')
})

test('a role can be hidden and dimmed', async ({ page }) => {
  const tests = page.getByTestId('role-test')
  await tests.getByRole('checkbox').click()
  await expect(tests.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('.chip.custom')).toBeVisible() // no preset hides only the tests
  await tests.getByRole('checkbox').click()
  await tests.hover()
  await tests.getByRole('button', { name: /Dim Tests/ }).click()
  await expect(tests).toHaveClass(/dim/)
})

test('search selects a node and shows its trace', async ({ page }) => {
  const errors = watchErrors(page)
  await page.getByTestId('search').fill('BooksPage')
  await page.getByTestId('search').press('Enter')
  const details = page.getByTestId('details')
  await expect(details.getByRole('heading', { name: 'BooksPage' })).toBeVisible()
  await expect(details.getByText('Trace')).toBeVisible()
  await expect(details.getByRole('button', { name: /GET \/api\/books/ }).first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(details).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the view is kept in the URL', async ({ page }) => {
  await page.getByTestId('preset-data').click()
  await expect.poll(() => page.url()).toContain('#view=')
  await page.reload()
  await expect(page.getByTestId('preset-data')).toHaveClass(/active/)
})

test('help opens with ? and closes with Escape', async ({ page }) => {
  await page.locator('.scene').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Help' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Help' })).toHaveCount(0)
})
