import { useState, type ReactNode } from 'react'
import { Icon } from './icons.tsx'

/** A collapsible section of a side panel. */
export function Section({ title, children, defaultOpen = true, aside }: { title: string; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={`side-section${open ? ' open' : ''}`}>
      <header>
        <button type="button" className="section-toggle" onClick={() => setOpen(!open)}>
          <Icon name="chevron" size={12} />
          <span>{title}</span>
        </button>
        {aside}
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  )
}

/** A labelled switch. */
export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
      <span className="toggle-label">{label}</span>
    </label>
  )
}
