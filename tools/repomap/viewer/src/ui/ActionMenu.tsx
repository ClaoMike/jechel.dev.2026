/**
 * A button that opens a menu of git commands. The menu is rendered on <body> (panels clip and blur
 * what's inside them), placed under the button, and works with the keyboard: arrows move, Escape
 * closes and gives the focus back.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './icons.tsx'

export type MenuItem =
  | { label: string; icon?: IconName; hint?: string; onSelect(): void; disabled?: boolean; danger?: boolean; title?: string }
  | { separator: true }
  | { heading: string }

export function ActionMenu({
  label,
  items,
  children,
  className = 'mini-button',
  testId,
  disabled = false,
  title,
}: {
  label: string
  items: MenuItem[]
  children: ReactNode
  className?: string
  testId?: string
  disabled?: boolean
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) {
      setPosition(null)
      return
    }
    const anchor = button.current.getBoundingClientRect()
    const box = menu.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - box.width - 8))
    const below = anchor.bottom + 4
    const top = below + box.height > window.innerHeight - 8 ? Math.max(8, anchor.top - box.height - 4) : below
    setPosition({ left, top })
  }, [open, items.length])

  // Focus the first item once the menu is placed (while it is measured it is hidden, and can't take the focus).
  const placed = position !== null
  useEffect(() => {
    if (open && placed) menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
  }, [open, placed])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(false)
    }
    const dismiss = () => setOpen(false)
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('resize', dismiss)
    window.addEventListener('blur', dismiss)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('blur', dismiss)
    }
  }, [open])

  const close = (focusButton = true) => {
    setOpen(false)
    if (focusButton) button.current?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const entries = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]
    const at = entries.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = entries[(at + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length]
      next?.focus()
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      entries[event.key === 'Home' ? 0 : entries.length - 1]?.focus()
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`${className}${open ? ' active' : ''}`}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            // Only the menu closes (not the panel behind it).
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
          } else if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            setOpen(true)
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={title ?? label}
        disabled={disabled}
        data-testid={testId}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            className="context-menu action-menu"
            role="menu"
            aria-label={label}
            onKeyDown={onKeyDown}
            style={position ? { position: 'fixed', left: position.left, top: position.top } : { position: 'fixed', left: 0, top: 0, visibility: 'hidden' }}
            data-testid={testId ? `${testId}-menu` : undefined}
          >
            {items.map((item, i) => {
              if ('separator' in item) return <div key={i} className="menu-separator" role="separator" />
              if ('heading' in item) {
                return (
                  <div key={i} className="menu-heading" role="presentation">
                    {item.heading}
                  </div>
                )
              }
              return (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  className={`context-item${item.danger ? ' danger' : ''}`}
                  disabled={item.disabled}
                  title={item.title}
                  onClick={() => {
                    close()
                    item.onSelect()
                  }}
                >
                  {item.icon ? <Icon name={item.icon} size={15} /> : <span className="menu-icon-space" />}
                  <span>{item.label}</span>
                  {item.hint && <span className="context-hint">{item.hint}</span>}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
