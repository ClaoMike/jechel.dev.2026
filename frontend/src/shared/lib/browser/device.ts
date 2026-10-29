/**
 * Can this device show Vice (an animated WebGL scene over a 1.5 MB picture) smoothly? Checked once,
 * before the first render, for visitors who haven't picked a theme. Signals, any of which is enough:
 * the browser asks to save data or is on a slow connection, little memory (Chrome reports it), two
 * cores or fewer, no WebGL 2, or WebGL drawn by the CPU (a software renderer: no real graphics card).
 * A device that passes but still draws the scene slowly is caught later, by its frame rate
 * (RivieraBackground → reportSlowScene).
 */
export function isLowPowerDevice(): boolean {
  const nav = navigator as Navigator & {
    deviceMemory?: number
    connection?: { saveData?: boolean; effectiveType?: string }
  }
  if (nav.connection?.saveData) return true
  if (nav.connection?.effectiveType && ['slow-2g', '2g', '3g'].includes(nav.connection.effectiveType)) return true
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return true
  if (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 2) return true
  return !hasHardwareWebGL2()
}

const SOFTWARE_RENDERERS = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i

function hasHardwareWebGL2(): boolean {
  if (!('WebGL2RenderingContext' in window)) return false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) as WebGL2RenderingContext | null
    if (!gl) return false
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return !SOFTWARE_RENDERERS.test(renderer)
  } catch {
    return false
  }
}

/** The light or dark the device asks for. */
export function systemTheme(): 'light' | 'dark' {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}
