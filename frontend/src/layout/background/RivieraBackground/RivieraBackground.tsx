import { useRivieraBackgroundViewModel } from './RivieraBackground.viewModel'

/**
 * The Vice theme's backdrop: the Riviera picture, animated (palms, sea, clouds, birds, the banner
 * plane and the bike's exhaust). A still picture where WebGL 2 isn't available or the scene can't be
 * drawn (over the canvas, which stays for a lost context the browser may give back). Decorative.
 */
export function RivieraBackground() {
  const { canvasRef, ...vm } = useRivieraBackgroundViewModel()

  return (
    <div className="scene-background" aria-hidden="true" data-state={vm.mode}>
      {vm.webgl && <canvas ref={canvasRef} />}
      {vm.mode === 'still' && <img src={vm.stillUrl} alt="" />}
    </div>
  )
}
