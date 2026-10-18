import { afterEach, describe, expect, it, vi } from 'vitest'
import { isLowPowerDevice } from './device'
import { frameRateWatch, SLOW_FPS } from './background/riviera'
import { onSlowSceneSwitch, reportSlowScene, setTheme, storedTheme } from './theme'

const lowPower = vi.mocked(isLowPowerDevice)

function prefersLight(light: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: light && query.includes('light'), addEventListener() {}, removeEventListener() {} }))
}

afterEach(() => {
  lowPower.mockReturnValue(false)
  vi.unstubAllGlobals()
})

describe('the theme a visitor starts with', () => {
  it('is Vice on a capable device', () => {
    expect(storedTheme()).toBe('vice')
  })

  it("is the device's own light or dark on a weak one", () => {
    lowPower.mockReturnValue(true)
    prefersLight(true)
    expect(storedTheme()).toBe('light')

    prefersLight(false)
    expect(storedTheme()).toBe('dark')
  })

  it('is always their own choice once they made one, Vice included', () => {
    lowPower.mockReturnValue(true)
    setTheme('vice')

    expect(storedTheme()).toBe('vice')
  })
})

describe('when Vice is too slow', () => {
  it("switches to the device's light or dark, says so, and starts there next time", () => {
    prefersLight(false)
    const heard: string[] = []
    const stop = onSlowSceneSwitch((theme) => heard.push(theme))

    reportSlowScene()
    stop()

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(heard).toEqual(['dark'])
    expect(storedTheme()).toBe('dark')
    expect(localStorage.getItem('theme')).toBeNull() // not made their choice
  })

  it("leaves Vice on when they chose it", () => {
    setTheme('vice')

    reportSlowScene()

    expect(document.documentElement.dataset.theme).toBe('vice')
  })
})

describe('frameRateWatch', () => {
  const visible = { visible: () => true }

  /** Frames every `ms` from 0 to `until`. */
  function run(watch: (now: number) => void, ms: number, until: number) {
    for (let now = 0; now <= until; now += ms) watch(now)
  }

  it('calls a scene drawing under the threshold slow, once, after the warm-up', () => {
    const onSlow = vi.fn()
    run(frameRateWatch(onSlow, visible), 1000 / (SLOW_FPS - 5), 10_000)

    expect(onSlow).toHaveBeenCalledTimes(1)
  })

  it('leaves a scene at ~30 fps alone', () => {
    const onSlow = vi.fn()
    run(frameRateWatch(onSlow, visible), 1000 / 30, 10_000)

    expect(onSlow).not.toHaveBeenCalled()
  })

  it("doesn't count a hidden tab or a pause as slow", () => {
    const onSlow = vi.fn()
    const watch = frameRateWatch(onSlow, { visible: () => false })
    run(watch, 200, 10_000)

    expect(onSlow).not.toHaveBeenCalled()
  })
})
