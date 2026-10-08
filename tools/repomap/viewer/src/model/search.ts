import type { GraphIndex } from './graph.ts'

export interface SearchHit {
  i: number
  score: number
}

/** Fuzzy search over labels, ids, files and routes. Prefix/whole-word matches rank first. */
export function search(index: GraphIndex, query: string, limit = 12): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: SearchHit[] = []
  index.nodes.forEach((node, i) => {
    const label = node.label.toLowerCase()
    let score = 0
    if (label === q) score = 100
    else if (label.startsWith(q)) score = 80 - Math.min(20, label.length - q.length) / 2
    else if (label.includes(q)) score = 62 - label.indexOf(q) / 4
    else if (wordStarts(label, q)) score = 55
    else {
      const route = typeof node.attrs?.route === 'string' ? node.attrs.route.toLowerCase() : ''
      const file = node.file?.toLowerCase() ?? ''
      if (route.includes(q)) score = 50
      else if (file.includes(q)) score = 38
      else if (node.id.toLowerCase().includes(q)) score = 34
      else if (isSubsequence(q, label)) score = 18
    }
    if (score > 0) {
      const priority = index.kinds.get(node.kind)?.labelPriority ?? 3
      hits.push({ i, score: score + priority * 0.6 + Math.min(4, Math.log2(1 + index.degree[i])) })
    }
  })
  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}

function wordStarts(label: string, q: string): boolean {
  return label.split(/[\s./:_#-]+|(?=[A-Z])/).some((word) => word.toLowerCase().startsWith(q))
}

function isSubsequence(q: string, text: string): boolean {
  let j = 0
  for (let i = 0; i < text.length && j < q.length; i++) if (text[i] === q[j]) j++
  return j === q.length
}
