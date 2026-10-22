/**
 * With no pointer, key, scroll or touch on the page this long (someone reading, or working in another
 * window with the site still on screen), what moves on its own holds still until the next one: the
 * Vice scene (riviera.ts) and the neon colours (glass.css, under <html data-idle>). A still page
 * costs next to nothing; a moving one keeps the GPU re-drawing it, and re-blurring the frosted glass.
 */
export const IDLE_MS = 60_000

/** What counts as someone using the page. Scroll is caught on its way down (it doesn't bubble). */
export const ACTIVITY = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'] as const

/**
 * Sets <html data-idle> after IDLE_MS without input, and takes it off at the next input (or when the
 * window gets focus back). Returns a function that stops watching.
 */
export function watchIdle(root: HTMLElement = document.documentElement, idleMs = IDLE_MS): () => void {
  let timer = 0
  const rest = () => root.setAttribute('data-idle', '')
  const wake = () => {
    if (root.hasAttribute('data-idle')) root.removeAttribute('data-idle')
    clearTimeout(timer)
    timer = window.setTimeout(rest, idleMs)
  }
  wake()
  for (const type of ACTIVITY) window.addEventListener(type, wake, { capture: true, passive: true })
  window.addEventListener('focus', wake)
  return () => {
    clearTimeout(timer)
    root.removeAttribute('data-idle')
    for (const type of ACTIVITY) window.removeEventListener(type, wake, { capture: true })
    window.removeEventListener('focus', wake)
  }
}
