import masksAUrl from '../../assets/riviera/masks-a.webp'
import masksBUrl from '../../assets/riviera/masks-b.webp'
import masksCUrl from '../../assets/riviera/masks-c.webp'
import planeUrl from '../../assets/riviera/plane.webp'
import plate1920Url from '../../assets/riviera/riviera-1920.webp'
import plate3840Url from '../../assets/riviera/riviera-3840.webp'
import { ACTIVITY, IDLE_MS } from '../idle'
import { FRAGMENT_SHADER, VERTEX_SHADER } from './rivieraShader'

export { plate1920Url }

const IMG_W = 1672
const IMG_H = 941
/** Which part of the picture stays in view when the screen is narrower than it (his bike). */
const FOCUS_X = 0.42
/**
 * Caps the canvas at 1440p worth of pixels (the browser scales it up). A 5K-class laptop screen
 * would otherwise draw ~6M pixels a frame for a picture that's mostly under frosted glass.
 */
const MAX_PIXELS = 2560 * 1440
/** Everything in the scene moves slowly: 30 fps looks the same as 120 and costs a quarter. */
const FRAME_MS = 1000 / 30
/** How long the neon colours take to flow once through the letters (as in glass.css). */
const NEON_CYCLE_S = 16
/** How often the neon colours move: as the CSS animation steps in the other themes (128 steps in 16 s). */
const NEON_STEPS_PER_S = 8
/** The neon site name and Vice mark (glass.css), which take the scene's time. */
const NEON_SELECTOR = '.site-header .neon-text, .site-header .neon-fill, .site-header .brand-fill'
/** While another window has focus (the page is only glanced at), half that. */
const UNFOCUSED_FRAME_MS = 1000 / 15

/** The banner's corners in the plane sprite (px): top-left, top-right, bottom-left. */
const BANNER = { tl: [182, 52], tr: [465, 87], bl: [193, 141] } as const

export interface RivieraOptions {
  /** Two lines for the banner the plane tows. */
  bannerText: readonly [string, string]
  /** Draw one still frame instead of animating. */
  still: boolean
  /** Called once the picture is on screen. */
  onReady?: () => void
  /**
   * Called once if the scene can't be drawn after all: a picture that won't load, a texture the GPU
   * refused, a first frame that came out black, or the WebGL context lost. The caller shows the still
   * picture instead (a lost context may come back: `webglcontextrestored` on the canvas).
   */
  onFail?: () => void
  /**
   * Called once if the scene can't keep up: after a warm-up, it drew under SLOW_FPS frames a second
   * (it aims for ~30) while the tab was visible and focused. The device is too weak for it.
   */
  onSlow?: () => void
  /** How long without input before the scene holds still (IDLE_MS; shorter in tests). */
  idleMs?: number
}

export interface Riviera {
  destroy(): void
}

/**
 * Loaded, then decoded ahead of the upload where the browser can. decode() alone isn't relied on: in
 * some WebKit browsers it fails (or never settles) for a picture that has loaded fine.
 */
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      const decoded = typeof image.decode === 'function' ? image.decode().catch(() => undefined) : Promise.resolve()
      void Promise.race([decoded, new Promise((wait) => setTimeout(wait, 1000))]).then(() => resolve(image))
    }
    image.onerror = () => reject(new Error(`couldn't load ${src}`))
    image.src = src
  })
}

/** The plane sprite with the banner text painted on, following the banner's slant. */
function paintBanner(plane: HTMLImageElement, [title, subtitle]: readonly [string, string]) {
  const canvas = document.createElement('canvas')
  canvas.width = plane.naturalWidth
  canvas.height = plane.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return plane
  ctx.drawImage(plane, 0, 0)

  // Lay out on a flat 1000×300 card, then map the card onto the banner's slanted shape.
  const W = 1000
  const H = 300
  const { tl, tr, bl } = BANNER
  ctx.save()
  ctx.setTransform((tr[0] - tl[0]) / W, (tr[1] - tl[1]) / W, (bl[0] - tl[0]) / H, (bl[1] - tl[1]) / H, tl[0], tl[1])
  ctx.globalCompositeOperation = 'source-atop' // only on the cloth
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(28, 24, 40, 0.9)'
  ctx.font = '900 118px "Arial Black", Impact, system-ui, sans-serif'
  ctx.fillText(title, W / 2, H * 0.42, W * 0.86)
  ctx.font = '700 46px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(150, 40, 40, 0.85)'
  ctx.fillText(subtitle, W / 2, H * 0.78, W * 0.8)
  ctx.restore()
  return canvas
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader error')
  return shader
}

function texture(gl: WebGL2RenderingContext, unit: number, source: TexImageSource, opts: { mipmaps?: boolean; premultiply?: boolean } = {}) {
  const tex = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !!opts.premultiply)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  if (opts.mipmaps) {
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  }
  return tex
}

/**
 * Starts the animated Riviera scene on the canvas. Returns null when WebGL 2 isn't available, so
 * the caller can show the still picture instead.
 */
function webgl2(canvas: HTMLCanvasElement) {
  try {
    return canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' })
  } catch {
    return null
  }
}

export function startRiviera(canvas: HTMLCanvasElement, options: RivieraOptions): Riviera | null {
  const gl = webgl2(canvas)
  if (!gl) return null

  let destroyed = false
  let ready = false
  let failed = false
  const fail = (error: unknown) => {
    if (destroyed || failed) return
    failed = true
    cancelAnimationFrame(frame)
    console.error('Riviera background:', error)
    options.onFail?.()
  }
  let frame = 0
  const clock = idleClock(performance.now(), options.idleMs ?? IDLE_MS)

  const program = gl.createProgram()!
  try {
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link error')
  } catch (error) {
    console.error('Riviera background:', error)
    return null
  }
  gl.useProgram(program)

  // One triangle that covers the screen.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(program, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  const uniform = (name: string) => gl.getUniformLocation(program, name)
  const uRes = uniform('uRes')
  const uOffset = uniform('uOffset')
  const uScale = uniform('uScale')
  const uTime = uniform('uTime')

  const resize = () => {
    const dpr = window.devicePixelRatio || 1
    let w = canvas.clientWidth * dpr
    let h = canvas.clientHeight * dpr
    const shrink = Math.min(1, Math.sqrt(MAX_PIXELS / (w * h)))
    w = Math.max(1, Math.round(w * shrink))
    h = Math.max(1, Math.round(h * shrink))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    gl.viewport(0, 0, w, h)
    // Cover the screen, like object-fit: cover.
    const scale = Math.max(w / IMG_W, h / IMG_H)
    gl.uniform2f(uRes, w, h)
    gl.uniform1f(uScale, scale)
    gl.uniform2f(uOffset, (w - IMG_W * scale) * FOCUS_X, (h - IMG_H * scale) * 0.5)
  }

  // The neon site name and Vice (glass.css) move with the scene's frames, so the frosted header behind
  // them is only re-blurred on frames that are drawn anyway: 8 times a second, not on each of the 30, and
  // set on those few elements, not on the header (where every element in it would be restyled each time).
  // Together that took the scene's cost from about 25% of a CPU to 15%.
  let neonStep = -1
  const moveNeon = (time: number) => {
    const step = Math.floor(time * NEON_STEPS_PER_S)
    if (step === neonStep) return
    neonStep = step
    const shift = `${(((step / NEON_STEPS_PER_S / NEON_CYCLE_S) % 1) * 100).toFixed(2)}%`
    for (const element of document.querySelectorAll<HTMLElement>(NEON_SELECTOR)) element.style.setProperty('--neon-shift', shift)
  }

  const draw = () => {
    const time = options.still ? 30 : clock.elapsed(performance.now()) / 1000
    gl.uniform1f(uTime, time)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    moveNeon(time)
  }

  let last = -Infinity
  const watch = frameRateWatch(options.onSlow)
  const loop = (now: number) => {
    if (destroyed) return
    // Nobody's using the page: stop asking for frames until they are (wake).
    if (clock.idle(now)) return
    frame = requestAnimationFrame(loop)
    // Displays refresh at 60–120 Hz; skip frames to hold ~30 fps (15 when the window isn't focused).
    if (now - last < (document.hasFocus() ? FRAME_MS : UNFOCUSED_FRAME_MS) - 2) return
    last = now
    draw()
    watch(now)
  }

  // Resizing a WebGL canvas clears it: drawn again at once (before the browser shows it), however the scene is
  // running, or the black behind it would show until the next frame (or, holding still, the next input).
  const observer = new ResizeObserver(() => {
    resize()
    draw()
  })

  // Did the frame just drawn come out as the picture? Checked once, at the start.
  const drewPicture = () => {
    if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) return false
    const pixel = new Uint8Array(4)
    gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
    return pixel[0] + pixel[1] + pixel[2] > 0
  }

  const big = Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1) > 2200
  const fits4k = (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) >= 3840
  const plateUrl = big && fits4k ? plate3840Url : plate1920Url

  Promise.all([plateUrl, masksAUrl, masksBUrl, masksCUrl, planeUrl].map(loadImage))
    .then(([plate, masksA, masksB, masksC, plane]) => {
      if (destroyed) return
      texture(gl, 0, plate, { mipmaps: true })
      texture(gl, 1, masksA)
      texture(gl, 2, masksB)
      texture(gl, 3, masksC)
      texture(gl, 4, paintBanner(plane, options.bannerText), { premultiply: true })
      ;['uPlate', 'uMasksA', 'uMasksB', 'uMasksC', 'uPlane'].forEach((name, unit) => gl.uniform1i(uniform(name), unit))
      resize()
      draw()
      // Drawn straight away, so the frame can be checked before it's shown: a texture the GPU refused
      // (too big, out of memory) samples as black, and a black screen is worse than the still picture.
      if (!drewPicture()) throw new Error(`the first frame came out black (GL error ${gl.getError()})`)
      observer.observe(canvas)
      if (!options.still) frame = requestAnimationFrame(loop)
      ready = true
      options.onReady?.()
    })
    .catch(fail)

  const wake = () => {
    if (!clock.input(performance.now()) || destroyed || !ready || failed || options.still) return
    // Held still until now: the next frame draws at once.
    last = -Infinity
    frame = requestAnimationFrame(loop)
  }
  for (const type of ACTIVITY) window.addEventListener(type, wake, { capture: true, passive: true })
  window.addEventListener('focus', wake)

  const onLost = (event: Event) => {
    // Kept restorable (preventDefault): the caller starts the scene again on webglcontextrestored.
    event.preventDefault()
    fail(new Error('WebGL context lost'))
  }
  canvas.addEventListener('webglcontextlost', onLost)

  return {
    destroy() {
      destroyed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      for (const type of ACTIVITY) window.removeEventListener(type, wake, { capture: true })
      window.removeEventListener('focus', wake)
      canvas.removeEventListener('webglcontextlost', onLost)
      for (const element of document.querySelectorAll<HTMLElement>(NEON_SELECTOR)) element.style.removeProperty('--neon-shift')
    },
  }
}

/**
 * The scene's time, which stops while nobody uses the page: after `idleMs` without input it holds still,
 * and the next input carries on from that moment (no jump). Times are performance.now() milliseconds.
 */
export function idleClock(start: number, idleMs = IDLE_MS) {
  let lastInput = start
  let pausedAt: number | null = null
  let pausedFor = 0
  return {
    /** Milliseconds of scene time at `now`: the time since start, less the time held still. */
    elapsed: (now: number) => (pausedAt ?? now) - start - pausedFor,
    /** True once `now` is idleMs past the last input: the scene holds still from then. */
    idle(now: number) {
      if (pausedAt === null && now - lastInput >= idleMs) pausedAt = lastInput + idleMs
      return pausedAt !== null
    },
    /** Someone used the page at `now`. True when the scene was holding still, so it has to start again. */
    input(now: number) {
      lastInput = now
      if (pausedAt === null) return false
      pausedFor += now - pausedAt
      pausedAt = null
      return true
    },
  }
}

/** Below this many frames a second (of the ~30 aimed for), the scene is too much for the device. */
export const SLOW_FPS = 20
const WARM_UP_MS = 2000
const MEASURE_MS = 4000

/**
 * Counts frames drawn while the tab is visible and focused: after a warm-up (textures uploading,
 * shaders compiling), if MEASURE_MS of them came in under SLOW_FPS a second, calls onSlow once.
 * A pause (hidden tab, lost focus, a long gap) restarts the count rather than counting as slow.
 */
export function frameRateWatch(
  onSlow: (() => void) | undefined,
  clock: { visible: () => boolean } = { visible: () => document.visibilityState === 'visible' && document.hasFocus() },
) {
  let started: number | null = null
  let windowStart = 0
  let frames = 0
  let previous = 0
  let done = !onSlow
  return (now: number) => {
    if (done) return
    if (!clock.visible() || now - previous > 1000) {
      // Paused: start over.
      started = null
    }
    previous = now
    if (started === null) {
      started = now
      windowStart = now + WARM_UP_MS
      frames = 0
      return
    }
    if (now < windowStart) return
    frames++
    const elapsed = now - windowStart
    if (elapsed >= MEASURE_MS) {
      done = true
      if ((frames / elapsed) * 1000 < SLOW_FPS) onSlow!()
    }
  }
}
