import { useEffect, useRef, useState } from 'react'
import { useAppDispatch } from '../../../store'
import { reportSlowScene } from '../../../store/themeSlice'
import { plate1920Url, startRiviera } from '../riviera'
import { strings } from '../../../strings'

/** What the plane's banner says. */
const BANNER_TEXT = ['JECHEL.DEV', strings.rivieraBackground.thanksStopping] as const

/**
 * The Vice theme's backdrop: the Riviera picture, animated (palms, sea, clouds, birds, the banner
 * plane and the bike's exhaust). A still picture where WebGL 2 isn't available or the scene can't be
 * drawn (over the canvas, which stays for a lost context the browser may give back), and a lost WebGL
 * context that the browser gives back starts it again. Decorative.
 */
export function RivieraBackground() {
  const dispatch = useAppDispatch()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [webgl] = useState(() => 'WebGL2RenderingContext' in window)
  const [mode, setMode] = useState<'loading' | 'ready' | 'still'>(webgl ? 'loading' : 'still')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    // Too slow here: the visitor gets their light or dark instead (unless they chose Vice themselves).
    const scene = startRiviera(canvas, {
      bannerText: BANNER_TEXT,
      still,
      onReady: () => setMode('ready'),
      onFail: () => setMode('still'),
      onSlow: () => dispatch(reportSlowScene()),
    })
    if (!scene) {
      setMode('still')
      return
    }
    const restart = () => {
      setMode('loading')
      setAttempt((n) => n + 1)
    }
    canvas.addEventListener('webglcontextrestored', restart)
    return () => {
      canvas.removeEventListener('webglcontextrestored', restart)
      scene.destroy()
    }
  }, [dispatch, attempt])

  return (
    <div className="scene-background" aria-hidden="true" data-state={mode}>
      {webgl && <canvas ref={canvasRef} />}
      {mode === 'still' && <img src={plate1920Url} alt="" />}
    </div>
  )
}
