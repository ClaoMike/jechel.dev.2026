import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Link } from 'react-router'
import { page } from 'vitest/browser'
import { renderView } from '../test/render'
import { useScrollMemory } from './useScrollMemory'

// Each page remembers how far down it was scrolled: a new one starts at the top, coming back returns there.

/** Two pages to go between (each test its own: the memory lasts as long as the tab). */
function Pages({ one = '/one', two = '/two' }: { one?: string; two?: string }) {
  useScrollMemory()
  return (
    <nav style={{ position: 'fixed', top: 0, left: 0 }}>
      <Link to={one}>One</Link> <Link to={two}>Two</Link>
    </nav>
  )
}

beforeEach(() => {
  document.body.style.height = '5000px'
})

afterEach(() => {
  document.body.style.height = ''
  window.scrollTo(0, 0)
})

const scrolled = () => Math.round(window.scrollY)
const scrollTo = async (y: number) => {
  window.scrollTo(0, y)
  window.dispatchEvent(new Event('scroll'))
  await expect.poll(scrolled).toBe(y)
}

describe('scroll memory', () => {
  it('starts a page not seen yet at the top, and comes back to where each was', async () => {
    await renderView(<Pages />, { path: '/one' })
    await scrollTo(800)

    await page.getByRole('link', { name: 'Two' }).click()
    await expect.poll(scrolled).toBe(0)
    await scrollTo(300)

    await page.getByRole('link', { name: 'One' }).click()
    await expect.poll(scrolled).toBe(800)
    expect(JSON.parse(sessionStorage.getItem('scroll.positions')!)).toMatchObject({ '/one': 800, '/two': 300 })
    expect(history.scrollRestoration).toBe('manual')
  })

  it('stops putting it back once the visitor scrolls themselves', async () => {
    await renderView(<Pages one="/three" two="/four" />, { path: '/three' })
    await scrollTo(1200)
    await page.getByRole('link', { name: 'Two' }).click()
    await expect.poll(scrolled).toBe(0)

    // Back to a page whose content is still short: it can't reach 1200 yet, and the visitor takes over.
    document.body.style.height = '600px'
    await page.getByRole('link', { name: 'One' }).click()
    window.dispatchEvent(new Event('wheel'))
    document.body.style.height = '5000px'
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(scrolled()).toBeLessThan(1200)
  })
})
