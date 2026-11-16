import { useViewer } from '../model/store.ts'
import { indexBoard, landingOf } from './model.ts'
import { useBoard } from './store.ts'

/**
 * Opens the board where the first of these nodes is a chip, selects it and lights them all up. `details`: the panel
 * describes it (off while browsing the Files tab, which stays open).
 */
export function showOnBoard(nodes: number[], { details = true }: { details?: boolean } = {}): void {
  const index = useViewer.getState().index
  if (!index || nodes.length === 0) return
  const bi = indexBoard(index)
  useViewer.getState().setTab('board')
  const board = useBoard.getState()
  if (bi.hidden[bi.rootOf[nodes[0]]] && !board.options.showHidden) board.setOption('showHidden', true)
  const landing = landingOf(bi, nodes[0], board.options)
  board.navigate(landing.path, 'in', landing.select)
  board.setFocus(nodes)
  if (details) board.setPanel('details')
}
