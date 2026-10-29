import { afterEach, describe, expect, it, vi } from 'vitest'
import { frameRateWatch, idleClock, SLOW_FPS, startRiviera, type Riviera } from './riviera'

// The Vice scene: its clock (which stops while nobody uses the page), the check for devices too slow
// for it, and the scene itself drawing, holding still and moving the neon colours.

describe('idleClock', () => {
  it('runs from the start while the page is used', () => {
    const clock = idleClock(1000, 500)
    expect(clock.idle(1200)).toBe(false)
    expect(clock.elapsed(1200)).toBe(200)
    expect(clock.input(1300)).toBe(false)
    expect(clock.idle(1700)).toBe(false)
    expect(clock.elapsed(1700)).toBe(700)
  })

  it('holds still from the moment the wait ran out, however late that is noticed', () => {
    const clock = idleClock(0, 500)
    clock.input(100)
    expect(clock.idle(599)).toBe(false)
    // Noticed late (the next frame came 4 s on): the time still stops at 100 + 500.
    expect(clock.idle(4600)).toBe(true)
    expect(clock.elapsed(4600)).toBe(600)
    expect(clock.elapsed(9000)).toBe(600)
  })

  it('carries on from where it stopped, without a jump, at the next input', () => {
    const clock = idleClock(0, 500)
    clock.idle(2000)
    expect(clock.input(10_000)).toBe(true)
    expect(clock.elapsed(10_000)).toBe(500)
    expect(clock.elapsed(10_250)).toBe(750)
    expect(clock.idle(10_250)).toBe(false)
  })

  it('adds up every pause', () => {
    const clock = idleClock(0, 100)
    clock.idle(1000) // held at 100
    clock.input(2000) // 1900 held
    clock.idle(3000) // held at 2100 → 200 of scene time
    clock.input(5000)
    expect(clock.elapsed(5000)).toBe(200)
    expect(clock.elapsed(5050)).toBe(250)
  })
})

describe('frameRateWatch', () => {
  const run = (fps: number, seconds: number, visible = () => true, start = 0) => {
    const onSlow = vi.fn()
    const watch = frameRateWatch(onSlow, { visible })
    for (let t = start; t <= start + seconds * 1000; t += 1000 / fps) watch(t)
    return onSlow
  }

  it('calls a device slow once it draws under the bar for the whole measure, after the warm-up', () => {
    expect(run(SLOW_FPS - 5, 10)).toHaveBeenCalledOnce()
    expect(run(30, 10)).not.toHaveBeenCalled()
    expect(run(SLOW_FPS + 1, 10)).not.toHaveBeenCalled()
  })

  it('waits for the warm-up and the whole measure before deciding', () => {
    expect(run(5, 5.9)).not.toHaveBeenCalled()
  })

  it("doesn't count frames while the tab is hidden or the window unfocused", () => {
    expect(run(5, 10, () => false)).not.toHaveBeenCalled()
  })

  it('starts over after a pause, such as the scene holding still while nobody used the page', () => {
    const onSlow = vi.fn()
    const watch = frameRateWatch(onSlow, { visible: () => true })
    // 30 fps, a 60 s pause, then 30 fps again: never slow.
    for (let t = 0; t <= 3000; t += 33) watch(t)
    for (let t = 63_000; t <= 75_000; t += 33) watch(t)
    expect(onSlow).not.toHaveBeenCalled()
  })

  it('decides only once', () => {
    const onSlow = vi.fn()
    const watch = frameRateWatch(onSlow, { visible: () => true })
    for (let t = 0; t <= 30_000; t += 100) watch(t)
    expect(onSlow).toHaveBeenCalledOnce()
  })
})

describe('the scene', () => {
  let scene: Riviera | null = null
  const cleanup: (() => void)[] = []
  afterEach(() => {
    scene?.destroy()
    scene = null
    cleanup.splice(0).forEach((undo) => undo())
  })

  /** A canvas whose WebGL draws are counted, inside a header with the neon site name, as on the page. */
  function stage(adjust?: (gl: WebGL2RenderingContext) => void) {
    const header = document.createElement('header')
    header.className = 'site-header'
    const name = document.createElement('span')
    name.className = 'brand-fill'
    const other = document.createElement('span')
    other.className = 'site-tagline'
    header.append(name, other)
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'width:320px;height:180px'
    document.body.append(header, canvas)
    cleanup.push(() => {
      header.remove()
      canvas.remove()
    })
    let draws = 0
    const getContext = canvas.getContext.bind(canvas)
    canvas.getContext = ((type: string, options?: unknown) => {
      const gl = getContext(type as 'webgl2', options as WebGLContextAttributes) as WebGL2RenderingContext | null
      if (gl) {
        const drawArrays = gl.drawArrays.bind(gl)
        gl.drawArrays = (...args) => {
          draws++
          drawArrays(...args)
        }
        adjust?.(gl)
      }
      return gl
    }) as typeof canvas.getContext
    return { header, name, other, canvas, draws: () => draws }
  }

  /** Starts the scene and waits for it to be ready or to fail: which one it was. */
  const settle = (canvas: HTMLCanvasElement) =>
    new Promise<'ready' | 'failed' | 'no webgl'>((resolve) => {
      scene = startRiviera(canvas, { bannerText: ['JECHEL.DEV', 'Hi'], still: false, onReady: () => resolve('ready'), onFail: () => resolve('failed') })
      if (!scene) resolve('no webgl')
    })

  const start = async (canvas: HTMLCanvasElement, idleMs: number) => {
    let ready!: () => void
    const loaded = new Promise<void>((resolve) => (ready = resolve))
    scene = startRiviera(canvas, { bannerText: ['JECHEL.DEV', 'Hi'], still: false, idleMs, onReady: () => ready() })
    if (!scene) return false
    await loaded
    return true
  }

  it('draws while the page is used, holds still when nobody uses it, and carries on at the next input', async (context) => {
    const { canvas, draws } = stage()
    if (!(await start(canvas, 700))) context.skip()
    // The wait counts from here (loading the pictures can take longer than it, on a busy machine).
    window.dispatchEvent(new Event('pointermove'))

    await expect.poll(draws, { timeout: 3000 }).toBeGreaterThan(3)
    // Nobody uses the page: after the wait, no more frames.
    await expect
      .poll(
        async () => {
          const before = draws()
          await new Promise((resolve) => setTimeout(resolve, 250))
          return draws() - before
        },
        { timeout: 5000 },
      )
      .toBe(0)
    const held = draws()

    window.dispatchEvent(new Event('pointermove'))
    await expect.poll(draws, { timeout: 3000 }).toBeGreaterThan(held + 2)
  })

  it('moves the neon colours on the neon elements only, a step at a time, and takes them off when it stops', async (context) => {
    const { header, name, other, canvas } = stage()
    if (!(await start(canvas, 60_000))) context.skip()

    await expect.poll(() => name.style.getPropertyValue('--neon-shift')).toMatch(/^\d+\.\d\d%$/)
    // Not on the header: that would restyle everything inside it each time.
    expect(header.style.getPropertyValue('--neon-shift')).toBe('')
    expect(other.style.getPropertyValue('--neon-shift')).toBe('')
    // 8 steps a second, as the plain themes' CSS animation: each step is 100% / (16 s × 8).
    const seen = new Set<string>()
    const until = performance.now() + 600
    while (performance.now() < until) {
      seen.add(name.style.getPropertyValue('--neon-shift'))
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    expect(seen.size).toBeGreaterThanOrEqual(3)
    expect(seen.size).toBeLessThanOrEqual(7)
    // Each a whole number of steps (written to 2 decimals: 3.125% shows as 3.13%).
    for (const shift of seen) {
      const steps = parseFloat(shift) / (100 / 128)
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(0.01)
    }

    scene!.destroy()
    scene = null
    expect(name.style.getPropertyValue('--neon-shift')).toBe('')
  })

  it('draws again at once when the canvas is resized (which clears it), even while holding still', async (context) => {
    const { canvas, draws } = stage()
    if (!(await start(canvas, 300))) context.skip()
    // Nobody uses the page: no more frames.
    await expect
      .poll(
        async () => {
          const before = draws()
          await new Promise((resolve) => setTimeout(resolve, 150))
          return draws() - before
        },
        { timeout: 3000 },
      )
      .toBe(0)
    const held = draws()

    canvas.style.height = '240px'

    await expect.poll(draws).toBeGreaterThan(held)
  })

  it('stops listening for input once destroyed', async (context) => {
    const { canvas, draws } = stage()
    if (!(await start(canvas, 200))) context.skip()
    await new Promise((resolve) => setTimeout(resolve, 400))
    scene!.destroy()
    scene = null
    const before = draws()
    window.dispatchEvent(new Event('keydown'))
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(draws()).toBe(before)
  })

  it('gives up, for the still picture, when the first frame comes out black (a texture the GPU refused)', async (context) => {
    const { canvas, draws } = stage((gl) => {
      gl.readPixels = () => {} // the pixel read stays black
    })
    const outcome = await settle(canvas)
    if (outcome === 'no webgl') context.skip()
    expect(outcome).toBe('failed')
    // And it doesn't go on drawing.
    const before = draws()
    window.dispatchEvent(new Event('pointermove'))
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(draws()).toBe(before)
  })

  it('gives up, for the still picture, when the WebGL context is lost', async (context) => {
    const { canvas } = stage()
    if (!(await start(canvas, 60_000))) context.skip()
    let failed!: () => void
    const lost = new Promise<void>((resolve) => (failed = resolve))
    scene!.destroy()
    scene = startRiviera(canvas, { bannerText: ['JECHEL.DEV', 'Hi'], still: false, onFail: () => failed() })
    canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext()
    await lost
  })
})
