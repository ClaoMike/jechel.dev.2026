import { hexToRgb, mix, type RGB } from '../model/colors.ts'
import type { Theme } from '../model/store.ts'

export interface SceneTheme {
  background: RGB
  /** Dimmed nodes/edges blend toward this. */
  fade: RGB
  text: string
  textDim: string
  halo: string
  planeOpacity: number
  gridOpacity: number
  borderOpacity: number
  edgeAlpha: number
  /** Light backgrounds need darker line colours. */
  darken: number
}

export const THEMES: Record<Theme, SceneTheme> = {
  dark: {
    background: hexToRgb('#070b14'),
    fade: hexToRgb('#101726'),
    text: '#e6edf7',
    textDim: 'rgba(203, 213, 225, 0.55)',
    halo: 'rgba(4, 7, 14, 0.92)',
    planeOpacity: 0.05,
    gridOpacity: 0.06,
    borderOpacity: 0.55,
    edgeAlpha: 1,
    darken: 0,
  },
  light: {
    background: hexToRgb('#f3f5fa'),
    fade: hexToRgb('#e3e8f1'),
    text: '#0f172a',
    textDim: 'rgba(51, 65, 85, 0.55)',
    halo: 'rgba(255, 255, 255, 0.95)',
    planeOpacity: 0.085,
    gridOpacity: 0.1,
    borderOpacity: 0.75,
    edgeAlpha: 1.25,
    darken: 0.38,
  },
}

/** Line/label colour adjusted for the theme (pastels are darkened on light backgrounds). */
export function inkFor(theme: SceneTheme, rgb: RGB): RGB {
  return theme.darken > 0 ? mix(rgb, [0, 0, 0], theme.darken) : rgb
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
