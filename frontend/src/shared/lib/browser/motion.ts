/** Whether to animate: not for visitors whose system asks for reduced motion. */
export function motionAllowed(): boolean {
  return window.matchMedia !== undefined && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
