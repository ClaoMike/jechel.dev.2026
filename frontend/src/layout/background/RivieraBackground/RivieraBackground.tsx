import { useRivieraBackgroundViewModel } from './RivieraBackground.viewModel'

/**
 * The Vice theme's backdrop: the Riviera picture, animated (palms, sea, clouds, birds, the banner
 * plane and the bike's exhaust). A still picture where WebGL 2 isn't available. Decorative.
 */
export function RivieraBackground() {
  const { canvasRef, ...vm } = useRivieraBackgroundViewModel()

  return (
    <div className="scene-background" aria-hidden="true" data-state={vm.mode}>
      {vm.mode === 'still' ? <img src={vm.stillUrl} alt="" /> : <canvas ref={canvasRef} />}
    </div>
  )
}
