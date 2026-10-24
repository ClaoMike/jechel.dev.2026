import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { Route, Routes } from 'react-router'
import type { TestFeature } from '../../features/featureTesting/testFeatures'
import { THEMES } from '../../layout/theme'
import { a11yViolations } from '../../test/a11y'
import { stubApi } from '../../test/api'
import { ADMIN, renderApp, renderView, shootWhole, textOf } from '../../test/render'
import { FeatureTestingPage } from './FeatureTestingPage'

// The admin's Feature Testing tab (BETA): features tried out before visitors get them, with a navigation between them.

const FEATURES: TestFeature[] = [
  { slug: 'work-with-me', title: 'Work with me', description: 'What I offer, and how to start.', Component: () => <p>The work with me page</p> },
  { slug: 'dark-map', title: 'Dark map', description: 'The map, darker.', Component: () => <p>The darker map</p> },
]

function show(path = '/features', { features = FEATURES as readonly TestFeature[], theme }: { features?: readonly TestFeature[]; theme?: 'dark' | 'light' | 'vice' } = {}) {
  stubApi({ user: ADMIN })
  return renderView(
    <Routes>
      <Route path="/features" element={<FeatureTestingPage features={features} />} />
      <Route path="/features/:feature" element={<FeatureTestingPage features={features} />} />
    </Routes>,
    { path, user: ADMIN, theme },
  )
}

const featureNav = () => page.getByRole('navigation', { name: 'Features' })
const link = (name: string) => featureNav().getByRole('link', { name })

describe('who sees it', () => {
  it('sends visitors who open the address home', async () => {
    stubApi()
    await renderApp({ path: '/features' })
    await expect.poll(() => location.pathname).toBe('/')
    expect(page.getByRole('link', { name: /Feature Testing/ }).query()).toBeNull()
  })

  it('is the last admin tab, marked BETA, and stays marked on a feature of its own', async () => {
    stubApi({ user: ADMIN })
    await renderApp({ path: '/features' })
    const tabs = page.getByRole('navigation', { name: 'Sections' }).getByRole('link')
    await expect.poll(() => textOf(tabs.last())).toBe('Feature Testing BETA')
    await expect.element(tabs.last()).toHaveAttribute('aria-current', 'page')
    expect(tabs.last().element().classList.contains('tab-admin')).toBe(true)
    expect(tabs.last().element().querySelector('.tab-badge')?.textContent).toBe('BETA')
  })
})

describe('with no features to test', () => {
  it('says so, with a flask', async () => {
    await show('/features', { features: [] })
    await expect.element(page.getByText('No features to test right now')).toBeVisible()
    await expect.element(page.getByText('New features show up here first, for you to try on the site before visitors see them.')).toBeVisible()
    expect(document.querySelector('.empty-state svg')).not.toBeNull()
    expect(featureNav().query()).toBeNull()
  })

  it("sends a feature's old address back to the empty page", async () => {
    const view = await show('/features/gone', { features: [] })
    await expect.poll(() => view.location()).toBe('/features')
    await expect.element(page.getByText('No features to test right now')).toBeVisible()
  })
})

describe('with features to test', () => {
  it('opens the first, with its name and what to try, marked in the navigation', async () => {
    const view = await show()
    await expect.poll(() => view.location()).toBe('/features/work-with-me')
    await expect.element(page.getByRole('heading', { name: 'Work with me' })).toBeVisible()
    await expect.element(page.getByText('What I offer, and how to start.')).toBeVisible()
    await expect.element(page.getByText('The work with me page')).toBeVisible()
    await expect.element(link('Work with me')).toHaveAttribute('aria-current', 'page')
    expect(featureNav().getByRole('link').elements().map((a) => a.textContent)).toEqual(['Work with me', 'Dark map'])
  })

  it('moves between them with the navigation, each at its own address', async () => {
    const view = await show()
    await link('Dark map').click()
    await expect.poll(() => view.location()).toBe('/features/dark-map')
    await expect.element(page.getByText('The darker map')).toBeVisible()
    expect(page.getByText('The work with me page').query()).toBeNull()
    await expect.element(link('Dark map')).toHaveAttribute('aria-current', 'page')
    await expect.element(link('Work with me')).not.toHaveAttribute('aria-current')
  })

  it('opens a feature from its address, and goes back to the first from one no longer on the list', async () => {
    const direct = await show('/features/dark-map')
    await expect.element(page.getByText('The darker map')).toBeVisible()
    expect(direct.location()).toBe('/features/dark-map')
    await direct.unmount()

    const gone = await show('/features/retired')
    await expect.poll(() => gone.location()).toBe('/features/work-with-me')
  })
})

describe('screenshots and accessibility', () => {
  for (const theme of THEMES) {
    it(`${theme}: empty, and with features, with no WCAG problems`, async () => {
      const empty = await show('/features', { features: [], theme })
      await expect.element(page.getByText('No features to test right now')).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await shootWhole(page.getByRole('main'), `${theme}-empty`)
      await empty.unmount()

      await show('/features', { theme })
      await expect.element(page.getByText('The work with me page')).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await shootWhole(page.getByRole('main'), `${theme}-features`)
    })
  }
})
