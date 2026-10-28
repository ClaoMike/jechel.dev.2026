/** Counts overlapping wires on every board of a graph.json: node test/overlap-survey.ts [.out/graph.json] */
import { readFileSync } from 'node:fs'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { RepoGraph } from '../src/shared/types.ts'
import { layoutScene, type ElkLike } from '../viewer/src/board/layout.ts'
import { buildScene, chipsIn, indexBoard, pathOfNode, type BoardPath } from '../viewer/src/board/model.ts'
import { indexGraph } from '../viewer/src/model/graph.ts'
import { overlaps } from '../viewer/src/board/overlaps.ts'

const graph = JSON.parse(readFileSync(process.argv[2] ?? '.out/graph.json', 'utf8')) as RepoGraph
const bi = indexBoard(indexGraph(graph))
const elk = new (ELK as unknown as new () => ElkLike)()
const options = { showHidden: process.env.ALL === '1', typeLinks: process.env.ALL === '1' }
const paths: BoardPath[] = [{ level: 'app' }, { level: 'tiers' }]
for (const tier of bi.board.tiers) {
  paths.push({ level: 'features', tier: tier.id })
  for (const feature of bi.board.features) if (chipsIn(bi, tier.id, feature.id, options).length) paths.push({ level: 'chips', tier: tier.id, feature: feature.id })
}
// Every chip's own board, too (the busiest first, up to 400).
const roots = [...new Set(bi.rootOf)].filter((r) => bi.index.outEdges[r].length + (bi.index.inEdges?.[r]?.length ?? 0) > 0)
roots.sort((a, b) => bi.index.outEdges[b].length - bi.index.outEdges[a].length)
for (const r of roots.slice(0, 400)) {
  const path = pathOfNode(bi, r, options)
  paths.push(path)
}
let boards = 0
let bad = 0
let total = 0
const worst: [string, number][] = []
for (const path of paths) {
  const scene = buildScene(bi, path, options)
  if (scene.chips.length === 0) continue
  const found = overlaps(await layoutScene(scene, elk), 2, Number(process.env.TOL ?? 1.5))
  if (path.level === 'features') found.push(...overlaps(await layoutScene(scene, elk, { portrait: true }), 2, Number(process.env.TOL ?? 1.5)))
  boards++
  if (found.length) bad++
  total += found.length
  worst.push([JSON.stringify(path), found.length])
}
worst.sort((a, b) => b[1] - a[1])
console.log(`${boards} boards, ${bad} with overlaps, ${total} overlapping pairs`)
for (const [p, n] of worst.slice(0, 8)) console.log(n, p)
