import type { Shape } from '../../../src/shared/types.ts'

/** 2D glyph for each 3D node shape, so the menu doubles as a legend. */
export function ShapeIcon({ shape, color, size = 14, ghost = false }: { shape: Shape; color: string; size?: number; ghost?: boolean }) {
  const common = { fill: ghost ? 'none' : color, stroke: color, strokeWidth: 1.4, strokeLinejoin: 'round' as const }
  const body = (() => {
    switch (shape) {
      case 'box':
        return <rect x="3" y="3" width="10" height="10" rx="1.5" {...common} />
      case 'octahedron':
        return <path d="M8 1.8 L14.2 8 L8 14.2 L1.8 8 Z" {...common} />
      case 'cylinder':
        return (
          <g>
            <path d="M3 4.5 V11.5 A5 2 0 0 0 13 11.5 V4.5" {...common} />
            <ellipse cx="8" cy="4.5" rx="5" ry="2" {...common} fill={ghost ? 'none' : color} style={{ filter: 'brightness(1.25)' }} />
          </g>
        )
      case 'cone':
      case 'tetrahedron':
        return <path d="M8 2 L14 13.5 H2 Z" {...common} />
      case 'torus':
        return <circle cx="8" cy="8" r="4.6" fill="none" stroke={color} strokeWidth={2.6} />
      case 'dodecahedron':
        return <path d="M8 1.8 L14.2 6.3 L11.8 13.6 H4.2 L1.8 6.3 Z" {...common} />
      case 'icosahedron':
        return <path d="M8 1.5 L13.8 4.8 V11.2 L8 14.5 L2.2 11.2 V4.8 Z" {...common} />
      case 'capsule':
        return <rect x="4" y="1.8" width="8" height="12.4" rx="4" {...common} />
      case 'tile':
        return <rect x="1.8" y="5" width="12.4" height="6" rx="1.5" {...common} />
      case 'disc':
        return <ellipse cx="8" cy="8" rx="6.2" ry="3.4" {...common} />
      default:
        return <circle cx="8" cy="8" r="5.6" {...common} />
    }
  })()
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shape-icon">
      {body}
    </svg>
  )
}

export function EdgeIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden="true" className="shape-icon">
      <path d="M1 8 C 6 8, 10 2, 15 2" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

type IconName =
  | 'menu' | 'search' | 'close' | 'fit' | 'side' | 'top' | 'sun' | 'moon' | 'help' | 'open' | 'chevron' | 'dim' | 'copy'
  | 'external' | 'up' | 'down' | 'link' | 'warn' | 'reset' | 'layers'

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    menu: <path d="M3 5h14M3 10h14M3 15h14" />,
    search: <><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2 17 17" /></>,
    close: <path d="M5 5l10 10M15 5 5 15" />,
    fit: <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />,
    side: <><path d="M3 6h14M3 10h14M3 14h14" /><path d="M10 3v14" strokeDasharray="1.5 2" /></>,
    top: <><rect x="3.5" y="3.5" width="13" height="13" rx="2" /><path d="M3.5 10h13M10 3.5v13" strokeDasharray="1.5 2" /></>,
    sun: <><circle cx="10" cy="10" r="3.4" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></>,
    moon: <path d="M15.5 12.4A6.2 6.2 0 0 1 7.6 4.5a6.2 6.2 0 1 0 7.9 7.9z" />,
    help: <><circle cx="10" cy="10" r="7" /><path d="M8 8a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.3v.4M10 14.2v.1" /></>,
    open: <path d="M3 6.5V15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-6L8.2 5H4a1 1 0 0 0-1 1.5z" />,
    chevron: <path d="M7.5 5l5 5-5 5" />,
    dim: <><circle cx="10" cy="10" r="6" /><path d="M10 4a6 6 0 0 1 0 12z" fill="currentColor" /></>,
    copy: <><rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" /></>,
    external: <path d="M11 4h5v5M16 4l-7 7M14 12v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3" />,
    up: <path d="M10 15V5M5.5 9.5 10 5l4.5 4.5" />,
    down: <path d="M10 5v10M5.5 10.5 10 15l4.5-4.5" />,
    link: <path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-.8.8M11.5 8.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l.8-.8" />,
    warn: <><path d="M10 3.5 17 16H3z" /><path d="M10 8.5v3.2M10 13.8v.1" /></>,
    reset: <path d="M4.5 9A5.5 5.5 0 1 1 6 13.6M4.5 4.5V9H9" />,
    layers: <path d="M10 3 17 6.8 10 10.6 3 6.8zM3 10.2l7 3.8 7-3.8M3 13.6l7 3.8 7-3.8" />,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}
