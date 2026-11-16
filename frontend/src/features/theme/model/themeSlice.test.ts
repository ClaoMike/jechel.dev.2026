import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeStore } from '@/test/store'
import { reportSlowScene, slowSceneSwitched, themeChosen, themeSlice } from './themeSlice'

// The theme on show: the visitor's choice, or what the site fell back to when Vice drew too slowly here.

const SLOW_KEY = 'theme.slowDevice'
const prefers = (scheme: 'light' | 'dark') => vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: query.includes(scheme) }) as MediaQueryList)

beforeEach(() => {
  localStorage.removeItem('theme')
  localStorage.removeItem(SLOW_KEY)
})

afterEach(() => {
  localStorage.removeItem('theme')
  localStorage.removeItem(SLOW_KEY)
  delete document.documentElement.dataset.theme
})

describe('Vice drawing too slowly', () => {
  it.each(['light', 'dark'] as const)('switches to the %s the device asks for, says so, and starts there next time', (scheme) => {
    prefers(scheme)
    const store = makeStore()

    store.dispatch(reportSlowScene())

    expect(store.getState().theme).toEqual({ theme: scheme, slowSwitchedTo: scheme })
    expect(document.documentElement.dataset.theme).toBe(scheme)
    expect(localStorage.getItem(SLOW_KEY)).toBe('1')
    // Not the visitor's choice: only remembered as a slow device.
    expect(localStorage.getItem('theme')).toBeNull()
    expect(makeStore().getState().theme.theme).toBe(scheme)
  })

  it('leaves Vice alone when the visitor chose it themselves', () => {
    prefers('light')
    localStorage.setItem('theme', 'vice')
    const store = makeStore()

    store.dispatch(reportSlowScene())

    expect(store.getState().theme).toEqual({ theme: 'vice', slowSwitchedTo: null })
    expect(localStorage.getItem(SLOW_KEY)).toBeNull()
  })

  it('leaves any theme the visitor chose alone', () => {
    localStorage.setItem('theme', 'dark')
    const store = makeStore()

    store.dispatch(reportSlowScene())

    expect(store.getState().theme).toEqual({ theme: 'dark', slowSwitchedTo: null })
    expect(localStorage.getItem(SLOW_KEY)).toBeNull()
  })
})

describe('the notice about it', () => {
  it('goes when the visitor dismisses it, the theme staying', () => {
    const store = makeStore()
    store.dispatch(slowSceneSwitched('light'))

    store.dispatch(themeSlice.actions.slowNoticeDismissed())

    expect(store.getState().theme).toEqual({ theme: 'light', slowSwitchedTo: null })
  })

  it('goes when the visitor picks a theme, which becomes their choice (Vice too, slow or not)', () => {
    const store = makeStore()
    store.dispatch(slowSceneSwitched('light'))

    store.dispatch(themeChosen('vice'))

    expect(store.getState().theme).toEqual({ theme: 'vice', slowSwitchedTo: null })
    expect(localStorage.getItem('theme')).toBe('vice')
    expect(document.documentElement.dataset.theme).toBe('vice')
    // Their choice from now on: a slow scene no longer overrides it.
    store.dispatch(reportSlowScene())
    expect(store.getState().theme.theme).toBe('vice')
  })
})
