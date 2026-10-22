import { useEffect, useRef, useState } from 'react'
import { useAppDispatch } from '../../../store'
import { reportSlowScene } from '../../../store/themeSlice'
import { plate1920Url, startRiviera } from '../riviera'

/** What the plane's banner says. */
const BANNER_TEXT = ['JECHEL.DEV', 'Thanks for stopping by!'] as const

/**
 * Runs the scene on the canvas: loading, then ready; or a still picture where WebGL 2 isn't available
 * or the scene couldn't be drawn. A lost WebGL context that the browser gives back starts it again.
 */
export function useRivieraBackgroundViewModel() {
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

  return { canvasRef, webgl, mode, stillUrl: plate1920Url }
}
