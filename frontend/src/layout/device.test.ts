import { afterEach, describe, expect, it, vi } from 'vitest'
import { isLowPowerDevice } from './device'
import { rememberSlowDevice } from './theme'

// Whether Vice (an animated WebGL scene) should start here: any sign of a weak device or connection says no.

const own: string[] = []

/** Pretends the browser reports this (an own property shadows the real one), for this test only. */
function report(name: string, value: unknown) {
  Object.defineProperty(navigator, name, { value, configurable: true })
  own.push(name)
}

/** A WebGL 2 context that says it's drawn by `renderer`. */
function gpu(renderer: string | null) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    getExtension: (name: string) => (name === 'WEBGL_debug_renderer_info' ? (renderer === null ? null : { UNMASKED_RENDERER_WEBGL: 1 }) : { loseContext: () => {} }),
    getParameter: () => renderer,
  } as unknown as RenderingContext)
}

afterEach(() => {
  for (const name of own.splice(0)) delete (navigator as unknown as Record<string, unknown>)[name]
  vi.restoreAllMocks()
})

describe('a weak device', () => {
  it.each([
    ['saving data', 'connection', { saveData: true }],
    ['on 3G', 'connection', { effectiveType: '3g' }],
    ['on 2G', 'connection', { effectiveType: 'slow-2g' }],
    ['with 2 GB of memory', 'deviceMemory', 2],
    ['with two cores', 'hardwareConcurrency', 2],
  ])('is %s', (_, name, value) => {
    gpu('Apple M2')
    report(name, value)
    expect(isLowPowerDevice()).toBe(true)
  })

  it('draws WebGL on the CPU, or has none, or it fails', () => {
    report('hardwareConcurrency', 8)
    gpu('Google SwiftShader')
    expect(isLowPowerDevice()).toBe(true)

    vi.restoreAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(isLowPowerDevice()).toBe(true)

    vi.restoreAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(isLowPowerDevice()).toBe(true)
  })

  it('has no WebGL 2 at all', () => {
    report('hardwareConcurrency', 8)
    const original = Object.getOwnPropertyDescriptor(window, 'WebGL2RenderingContext')!
    delete (window as unknown as Record<string, unknown>).WebGL2RenderingContext
    try {
      expect(isLowPowerDevice()).toBe(true)
    } finally {
      Object.defineProperty(window, 'WebGL2RenderingContext', original)
    }
  })
})

describe('a capable device', () => {
  it('has memory, cores, a fast connection and a real graphics card', () => {
    report('connection', { saveData: false, effectiveType: '4g' })
    report('deviceMemory', 8)
    report('hardwareConcurrency', 8)
    gpu('ANGLE (Apple, Apple M2, OpenGL 4.1)')
    expect(isLowPowerDevice()).toBe(false)
  })

  it('…even when the browser won’t name its graphics card', () => {
    report('hardwareConcurrency', 8)
    gpu(null)
    expect(isLowPowerDevice()).toBe(false)
  })
})

describe('remembering a slow device', () => {
  it('doesn’t fail where storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(() => rememberSlowDevice()).not.toThrow()
  })
})
