import { useEffect, useRef, useState } from 'react'
import { useAppDispatch } from '../../../store'
import { reportSlowScene } from '../../../store/themeSlice'
import { plate1920Url, startRiviera } from '../riviera'

/** What the plane's banner says. */
const BANNER_TEXT = ['JECHEL.DEV', 'Thanks for stopping by!'] as const

/** Runs the scene on the canvas: loading, then ready; or a still picture where WebGL 2 isn't available. */
export function useRivieraBackgroundViewModel() {
  const dispatch = useAppDispatch()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<'loading' | 'ready' | 'still'>(() => ('WebGL2RenderingContext' in window ? 'loading' : 'still'))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    // Too slow here: the visitor gets their light or dark instead (unless they chose Vice themselves).
    const scene = startRiviera(canvas, { bannerText: BANNER_TEXT, still, onReady: () => setMode('ready'), onSlow: () => dispatch(reportSlowScene()) })
    if (!scene) setMode('still')
    return () => scene?.destroy()
  }, [dispatch])

  return { canvasRef, mode, stillUrl: plate1920Url }
}
