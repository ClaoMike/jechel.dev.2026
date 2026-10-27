import type { KeyboardEvent } from 'react'
import { useViewer, type Tab } from '../model/store.ts'
import { Icon } from './icons.tsx'

const TABS: { id: Tab; icon: 'layers' | 'git' | 'focus'; label: string; short: string }[] = [
  { id: 'board', icon: 'focus', label: 'Board', short: 'Board' },
  { id: 'map', icon: 'layers', label: 'Architecture', short: 'Map' },
  { id: 'git', icon: 'git', label: 'Git history', short: 'History' },
]

/** Board | architecture map | git history (arrow keys move between them, as in any tab list). */
export function Tabs() {
  const tab = useViewer((s) => s.tab)
  const setTab = useViewer((s) => s.setTab)
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = TABS.findIndex((t) => t.id === tab)
    let next = -1
    if (event.key === 'ArrowRight') next = (current + 1) % TABS.length
    else if (event.key === 'ArrowLeft') next = (current + TABS.length - 1) % TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TABS.length - 1
    if (next < 0) return
    event.preventDefault()
    setTab(TABS[next].id)
    document.getElementById(`tab-${TABS[next].id}`)?.focus()
  }
  return (
    <div className="tabs" role="tablist" aria-label="Views" onKeyDown={onKeyDown}>
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls={`panel-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          className={`tab${tab === t.id ? ' active' : ''}`}
          onClick={() => setTab(t.id)}
          data-testid={`tab-${t.id}`}
        >
          <Icon name={t.icon} size={15} />
          <span className="tab-label wide-only-inline">{t.label}</span>
          <span className="tab-label narrow-only-inline">{t.short}</span>
        </button>
      ))}
    </div>
  )
}
