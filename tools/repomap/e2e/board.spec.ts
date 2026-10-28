import { expect, test, type Page } from '@playwright/test'
import { BOOK_CARD, DEMO, mapLoaded, serveSource, violations, watchErrors } from './helpers.ts'

const chip = (page: Page, id: string) => page.locator(`[data-chip="${id}"]`)
/** On the Books board: BooksPage renders it (BookCard, which it renders, is one board further in). */
const BOOK_LIST = 'frontend:symbol:web/src/features/books/BookList.tsx#BookList'
const trail = (page: Page) => page.locator('.board-trail')

/** Wheel-zooms on the middle of a chip until the board opens it. */
async function zoomInto(page: Page, id: string): Promise<void> {
  const box = (await chip(page, id).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let k = 0; k < 12; k++) await page.mouse.wheel(0, -260)
}

test.describe('board', () => {
  test('zooms from the app to its tiers, a feature, its chips and one chip', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/#tab=board')
    await mapLoaded(page)
    await expect(chip(page, 'app')).toBeVisible()
    await chip(page, 'app').dblclick()
    await expect(trail(page)).toContainText('Tiers')
    await expect(chip(page, 'frontend')).toBeVisible()
    await expect(chip(page, 'backend')).toBeVisible()
    expect(page.url()).toContain('board=tiers')

    // A tap selects: the panel describes it; Open goes in.
    await chip(page, 'frontend').click()
    await expect(page.getByTestId('board-chip-details')).toContainText('Frontend')
    await page.getByTestId('board-open').click()
    await expect(chip(page, 'f:book')).toBeVisible()
    await expect(chip(page, 'out:backend')).toBeVisible()

    await chip(page, 'f:book').dblclick()
    await expect(trail(page)).toContainText('Book')
    await expect(chip(page, BOOK_LIST)).toBeVisible()
    await chip(page, BOOK_LIST).click()
    await expect(page.getByTestId('board-chip-details')).toContainText('BookList')
    await page.getByTestId('board-open').click()
    await expect(trail(page).locator('button').last()).toHaveText('BookList')
    // On its own board the chip is described without selecting it.
    await expect(page.getByTestId('board-chip-details')).toContainText('BookList')

    // BookCard is on BookList's own board, where it leads.
    await expect(page.locator(`[data-chip="out:${BOOK_CARD}"]`)).toBeVisible()
    // Esc goes back up, one level at a time.
    await page.locator('.board-canvas').click({ position: { x: 5, y: 300 } })
    await page.keyboard.press('Escape')
    await expect(chip(page, BOOK_LIST)).toBeVisible()
    await page.getByTestId('board-trail-1').click()
    await expect(chip(page, 'frontend')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('going chip to chip, up retraces the way you came, and the trail shows it', async ({ page }) => {
    const pagePath = 'frontend:symbol:web/src/features/books/BooksPage.tsx#BooksPage'
    const open = async (id: string) => {
      await page.locator(`[data-chip="${id}"]`).first().click({ force: true })
      await page.getByTestId('board-open').click()
    }
    await page.goto('/#tab=board&board=chips~frontend~book~')
    await mapLoaded(page)
    await open(pagePath)
    await open(`out:${BOOK_LIST}`)
    await open(`out:${BOOK_CARD}`)
    await expect(trail(page)).toContainText('Book›BooksPage›BookList›BookCard')
    await page.getByTestId('board-up').click()
    await expect(trail(page).locator('button').last()).toHaveText('BookList')
    // BookList's board, not BookCard's feature board: and the chip you left is selected.
    await expect(chip(page, BOOK_LIST)).toBeVisible()
    await page.getByTestId('board-up').click()
    await expect(trail(page).locator('button').last()).toHaveText('BooksPage')
    // A step of the trail goes straight there.
    await open(`out:${BOOK_LIST}`)
    await page.getByRole('button', { name: 'Book', exact: true }).click()
    await expect(trail(page).locator('button').last()).toHaveText('Book')
  })

  test('zooming far into a chip opens it; far out goes up', async ({ page }) => {
    await page.goto('/#tab=board&board=tiers')
    await mapLoaded(page)
    await zoomInto(page, 'backend')
    await expect(trail(page)).toContainText('Backend', { timeout: 5000 })
    await expect(chip(page, 'out:database')).toBeVisible()
    // On a busy machine the new board may still be settling: zoom out again until it goes up.
    await expect(async () => {
      const stage = (await page.getByTestId('board-svg').boundingBox())!
      await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2)
      for (let k = 0; k < 8; k++) await page.mouse.wheel(0, 300)
      await expect(chip(page, 'frontend')).toBeVisible({ timeout: 1500 })
    }).toPass({ timeout: 15_000 })
  })

  test('a wire lists the connections it carries and opens their code', async ({ page }) => {
    await serveSource(page)
    await page.goto('/#tab=board&board=tiers')
    await mapLoaded(page)
    const wire = page.locator('[data-wire^="frontend|"]').first()
    await wire.locator('.wire-hit').click({ force: true })
    const details = page.getByTestId('board-wire-details')
    await expect(details).toContainText('Frontend → Backend')
    await expect(details).toContainText('http')
  })

  test('a component says what it shows in which state; pointing at a state lights those chips', async ({ page }) => {
    const page_ = 'frontend:symbol:web/src/features/books/BooksPage.tsx#BooksPage'
    const list = 'frontend:symbol:web/src/features/books/BookList.tsx#BookList'
    await page.goto('/#tab=board&board=chips~frontend~book~')
    await mapLoaded(page)
    // On the board: BooksPage → [its state] → BookList.
    const state = page.locator(`[data-chip^="state:${page_}:"]`)
    await expect(state).toContainText("state.status === 'loaded'")
    await expect(page.locator(`[data-wire^="state:${page_}:"][data-wire*="${list}"]`).first()).toHaveClass(/conditional/)
    await state.click()
    await expect(page.getByTestId('board-state-details')).toContainText('BookList')
    await expect(page.getByTestId('board-state-details')).toContainText('of BooksPage')
    await chip(page, page_).click()
    const states = page.getByTestId('board-render-states')
    await expect(states).toContainText("state.status === 'loaded'")
    await expect(states).toContainText('useBooks')
    await expect(states).toContainText('BookList')
    await states.locator('li').first().hover()
    await expect(chip(page, list)).toHaveClass(/focused/)
  })

  test('finds a chip and reads its code', async ({ page }) => {
    await serveSource(page)
    await page.goto('/#tab=board')
    await mapLoaded(page)
    await page.getByTestId('board-search').fill('BookCard')
    await page.getByTestId('board-search').press('Enter')
    await expect(chip(page, BOOK_CARD)).toHaveClass(/selected/)
    await page.getByTestId('board-read-code').click()
    await expect(page.getByTestId('code-viewer').locator('.cm-content')).toContainText('export function BookCard')
  })

  test('reviews a commit: changed chips, what may be affected', async ({ page }) => {
    await page.goto('/#tab=board&board=features~frontend')
    await mapLoaded(page)
    await page.getByTestId('board-tool-review').click()
    const review = page.getByTestId('board-review')
    await expect(review.getByTestId('board-review-choice').locator('option', { hasText: 'Wishlist button' })).toHaveCount(1)
    const value = await review.getByTestId('board-review-choice').locator('option', { hasText: 'Wishlist button' }).getAttribute('value')
    await review.getByTestId('board-review-choice').selectOption(value!)
    await review.getByTestId('board-review-start').click()
    await expect(review).toContainText(`${DEMO.wishlistButton} Wishlist button on book cards`)
    await expect(review).toContainText('BookCard')
    await expect(chip(page, 'f:book')).toHaveClass(/touched/)
    await expect(page.getByTestId('board-panel-review')).toContainText(/\d/)
    await review.getByRole('button', { name: /BookCard/ }).first().click()
    await expect(chip(page, BOOK_CARD)).toHaveClass(/touched/)
  })

  test('tests and tooling show when asked', async ({ page }) => {
    await page.goto('/#tab=board&board=tiers')
    await mapLoaded(page)
    const before = await page.locator('[data-chip]').count()
    await page.getByTestId('board-show-hidden').check()
    await expect.poll(() => page.locator('[data-chip]').count()).toBeGreaterThanOrEqual(before)
    await page.getByTestId('board-show-hidden').uncheck()
  })
})

for (const theme of ['dark', 'light'] as const) {
  test.describe(`board accessibility, ${theme} theme`, () => {
    test.use({ colorScheme: theme, reducedMotion: 'reduce' })
    test('levels, a chip and the panels', async ({ page }) => {
      await page.goto('/#tab=board')
      await mapLoaded(page)
      await expect(chip(page, 'app')).toBeVisible()
      expect(await violations(page)).toEqual([])
      await page.goto('/#tab=board&board=chips~frontend~book~')
      await page.reload()
      await expect(chip(page, BOOK_LIST)).toBeVisible()
      await chip(page, BOOK_LIST).click()
      expect(await violations(page)).toEqual([])
      for (const panel of ['review', 'rules', 'ai'] as const) {
        await page.getByTestId(`board-panel-${panel}`).click()
        expect(await violations(page)).toEqual([])
      }
    })
  })
}
