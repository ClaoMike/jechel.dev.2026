/**
 * Lane layout of a commit graph (the "railway" drawn next to `git log --graph`).
 *
 * Rows come newest first with every commit before its parents. Walking down, each lane waits for
 * one commit: a commit takes the leftmost lane waiting for it (or a free lane when it is a branch
 * tip), other lanes waiting for it end there, and its first parent continues in its lane. A merge's
 * other parents join a lane already heading there, or open a new lane to the right. Lanes never
 * shift sideways, so lines only bend where branches fork or merge.
 */

export interface LaneInput {
  hash: string
  parents: string[]
}

export interface LaneEdge {
  /** Row of the child. */
  from: number
  /** Row of the parent; the number of rows when the parent isn't listed (history cut off). */
  to: number
  /** Lane of the child. */
  fromLane: number
  /** Lane of the parent. */
  toLane: number
  /** Lane the line runs in between the two rows. */
  lane: number
  /** Colour index (the lane's branch). */
  color: number
  /** A merge's second (or later) parent. */
  merge: boolean
}

export interface LaneLayout {
  /** Lane of each row. */
  lane: Int32Array
  /** Colour index of each row. */
  color: Int32Array
  /** Sorted by `from`. */
  edges: LaneEdge[]
  /** Lanes used (the widest point). */
  width: number
}

/**
 * @param reserve tips that get the leftmost lanes before anything else (the main branch first), so
 *   the trunk stays a straight line on the left even when newer work on other branches comes first.
 */
export function layoutLanes(rows: LaneInput[], reserve: string[] = []): LaneLayout {
  const lane = new Int32Array(rows.length)
  const color = new Int32Array(rows.length)
  const edges: LaneEdge[] = []
  const listed = new Set(rows.map((r) => r.hash))
  /** The commit each lane is waiting for (null: free). */
  const waiting: (string | null)[] = []
  const laneColor: number[] = []
  const pending = new Map<string, LaneEdge[]>()
  let nextColor = 0
  let width = 0

  for (const hash of reserve) {
    if (!listed.has(hash) || waiting.includes(hash)) continue
    waiting.push(hash)
    laneColor.push(nextColor++)
  }

  const freeLane = (after = -1): number => {
    for (let i = after + 1; i < waiting.length; i++) if (waiting[i] === null) return i
    waiting.push(null)
    laneColor.push(0)
    return waiting.length - 1
  }

  for (let row = 0; row < rows.length; row++) {
    const { hash, parents } = rows[row]
    let own = waiting.indexOf(hash)
    if (own < 0) {
      own = freeLane()
      laneColor[own] = nextColor++
    }
    // Every other lane that was heading here ends at this commit.
    for (let i = 0; i < waiting.length; i++) if (waiting[i] === hash) waiting[i] = null
    lane[row] = own
    color[row] = laneColor[own]
    width = Math.max(width, own + 1)

    for (const edge of pending.get(hash) ?? []) {
      edge.to = row
      edge.toLane = own
    }
    pending.delete(hash)

    parents.forEach((parent, k) => {
      let target: number
      if (k === 0) {
        target = own
        waiting[own] = parent
      } else {
        target = waiting.indexOf(parent)
        if (target < 0) {
          target = freeLane(own)
          waiting[target] = parent
          laneColor[target] = nextColor++
        }
      }
      width = Math.max(width, target + 1)
      const edge: LaneEdge = { from: row, to: rows.length, fromLane: own, toLane: target, lane: target, color: laneColor[target], merge: k > 0 }
      edges.push(edge)
      const list = pending.get(parent)
      if (list) list.push(edge)
      else pending.set(parent, [edge])
    })
  }
  return { lane, color, edges, width }
}

/** SVG path of an edge, with rows `rowHeight` apart and lanes `laneWidth` apart. */
export function edgePath(edge: LaneEdge, x: (lane: number) => number, y: (row: number) => number): string {
  const x1 = x(edge.fromLane)
  const y1 = y(edge.from)
  const xm = x(edge.lane)
  const x2 = x(edge.toLane)
  const y2 = y(edge.to)
  const curve = (ax: number, ay: number, bx: number, by: number) => {
    const my = (ay + by) / 2
    return `C${ax} ${my} ${bx} ${my} ${bx} ${by}`
  }
  if (edge.to - edge.from <= 1) {
    return x1 === x2 ? `M${x1} ${y1}L${x2} ${y2}` : `M${x1} ${y1}${curve(x1, y1, x2, y2)}`
  }
  let d = `M${x1} ${y1}`
  let cy = y1
  if (xm !== x1) {
    // A merge leaves its lane right away.
    cy = y(edge.from + 1)
    d += curve(x1, y1, xm, cy)
  }
  const bend = xm !== x2 ? y(edge.to - 1) : y2
  if (bend > cy) d += `L${xm} ${bend}`
  if (xm !== x2) d += curve(xm, bend, x2, y2)
  return d
}
