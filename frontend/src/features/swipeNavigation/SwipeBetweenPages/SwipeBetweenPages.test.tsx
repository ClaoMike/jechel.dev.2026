import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { THEMES } from '../../../layout/theme'
import { a11yViolations } from '../../../test/a11y'
import { renderView, shootWhole } from '../../../test/render'
import { SwipeBetweenPages } from './SwipeBetweenPages'

// Swipe between pages, in Feature Testing: how it works, and something to try the exceptions on (the swipe: useSwipeNavigation).

describe('Swipe between pages', () => {
  it('says how it works, in order, and gives a strip that scrolls sideways and a text box to try', async () => {
    await renderView(<SwipeBetweenPages />)
    const rules = page.getByRole('region', { name: 'How it works' }).getByRole('listitem')
    expect(rules.elements().map((li) => li.querySelector('strong')!.textContent)).toEqual([
      'Left: the next page',
      'Right: the previous one',
      'On System’s pages, between them',
      'Not from the screen’s edge',
      'Not on what moves sideways itself',
    ])
    const tryIt = page.getByRole('region', { name: 'Try it' })
    await expect.element(tryIt.getByRole('region', { name: 'A strip that scrolls sideways' })).toBeVisible()
    await expect.element(tryIt.getByRole('textbox', { name: 'A text box' })).toBeVisible()
  })

  for (const theme of THEMES) {
    it(`${theme}: looks right, with no WCAG problems`, async () => {
      await renderView(
        <section className="card">
          <SwipeBetweenPages />
        </section>,
        { theme },
      )
      expect(await a11yViolations()).toEqual([])
      await shootWhole(page.getByRole('main'), theme)
    })
  }
})
