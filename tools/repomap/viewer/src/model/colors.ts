import type { GraphIndex } from './graph.ts'

export type RGB = [number, number, number]
export type ColorBy = 'kind' | 'layer' | 'role' | 'feature'

const cache = new Map<string, RGB>()

export function hexToRgb(hex: string): RGB {
  const cached = cache.get(hex)
  if (cached) return cached
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  const n = Number.parseInt(full, 16)
  const rgb: RGB = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  cache.set(hex, rgb)
  return rgb
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export function rgbCss(rgb: RGB, alpha = 1): string {
  return `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, ${alpha})`
}

/** Distinct, readable hues for features (on dark and light backgrounds). */
export const FEATURE_PALETTE = [
  '#38bdf8', '#f472b6', '#a3e635', '#fb923c', '#c084fc', '#2dd4bf', '#facc15', '#f87171', '#818cf8', '#4ade80', '#fda4af', '#67e8f9',
]

export function nodeHex(index: GraphIndex, i: number, colorBy: ColorBy): string {
  const node = index.nodes[i]
  switch (colorBy) {
    case 'layer':
      return index.layerById.get(node.layer)?.color ?? '#9ca3af'
    case 'role':
      return index.roles.get(node.role)?.color ?? '#9ca3af'
    case 'feature': {
      const f = index.featureOf[i]
      return f >= 0 ? FEATURE_PALETTE[f % FEATURE_PALETTE.length] : '#64748b'
    }
    default:
      return index.kinds.get(node.kind)?.color ?? '#9ca3af'
  }
}

export function nodeRgb(index: GraphIndex, i: number, colorBy: ColorBy): RGB {
  return hexToRgb(nodeHex(index, i, colorBy))
}
