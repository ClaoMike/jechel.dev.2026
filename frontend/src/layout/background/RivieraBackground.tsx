import { useEffect, useRef, useState } from 'react'
import { plate1920Url, startRiviera } from './riviera'

/** What the plane's banner says. */
const BANNER_TEXT = ['JECHEL.DEV', 'Thanks for stopping by!'] as const

/**
 * The R* theme's backdrop: the Riviera picture, animated (palms, sea, clouds, birds, the banner
 * plane and the bike's exhaust). A still picture where WebGL 2 isn't available. Decorative.
 */
export function RivieraBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<'loading' | 'ready' | 'still'>(() =>
    'WebGL2RenderingContext' in window ? 'loading' : 'still',
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const scene = startRiviera(canvas, { bannerText: BANNER_TEXT, still, onReady: () => setMode('ready') })
    if (!scene) setMode('still')
    return () => scene?.destroy()
  }, [])

  return (
    <div className="scene-background" aria-hidden="true" data-state={mode}>
      {mode === 'still' ? <img src={plate1920Url} alt="" /> : <canvas ref={canvasRef} />}
    </div>
  )
}
