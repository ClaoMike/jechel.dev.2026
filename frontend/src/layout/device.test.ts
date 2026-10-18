import { afterEach, describe, expect, it, vi } from 'vitest'

const { isLowPowerDevice } = await vi.importActual<typeof import('./device')>('./device')

/** A WebGL 2 context whose renderer is `renderer`, or none. */
function webgl(renderer: string | null) {
  vi.stubGlobal('WebGL2RenderingContext', class {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() =>
    renderer === null
      ? null
      : ({
          getExtension: (name: string) => (name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 1 } : { loseContext: () => {} }),
          getParameter: () => renderer,
        } as unknown as RenderingContext),
  )
}

function navigatorWith(values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) Object.defineProperty(navigator, key, { value, configurable: true })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('isLowPowerDevice', () => {
  it('is false with a real graphics card and nothing else against it', () => {
    webgl('ANGLE (Apple, Apple M2, OpenGL 4.1)')
    navigatorWith({ hardwareConcurrency: 8 })

    expect(isLowPowerDevice()).toBe(false)
  })

  it.each([
    ['no WebGL 2', null],
    ['a software renderer', 'Google SwiftShader'],
    ['Mesa llvmpipe', 'llvmpipe (LLVM 15.0.7, 256 bits)'],
  ])('is true with %s', (_, renderer) => {
    webgl(renderer)
    navigatorWith({ hardwareConcurrency: 8 })

    expect(isLowPowerDevice()).toBe(true)
  })

  it('is true when the browser asks to save data, on a slow connection, with little memory or two cores', () => {
    webgl('Apple GPU')
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true })
    expect(isLowPowerDevice()).toBe(true)

    Object.defineProperty(navigator, 'connection', { value: { effectiveType: '3g' }, configurable: true })
    expect(isLowPowerDevice()).toBe(true)

    Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'deviceMemory', { value: 2, configurable: true })
    expect(isLowPowerDevice()).toBe(true)

    Object.defineProperty(navigator, 'deviceMemory', { value: undefined, configurable: true })
    navigatorWith({ hardwareConcurrency: 2 })
    expect(isLowPowerDevice()).toBe(true)
  })
})
