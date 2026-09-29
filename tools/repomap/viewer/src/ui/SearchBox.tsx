import { useEffect, useMemo, useRef, useState } from 'react'
import { search } from '../model/search.ts'
import { useViewer } from '../model/store.ts'
import { Icon, ShapeIcon } from './icons.tsx'

/** ⌘K / "/" search across labels, routes, files and ids; Enter flies to the result. */
export function SearchBox() {
  const index = useViewer((s) => s.index)
  const open = useViewer((s) => s.searchOpen)
  const setOpen = useViewer((s) => s.setSearchOpen)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const hits = useMemo(() => (index ? search(index, query, 12) : []), [index, query])

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])
  useEffect(() => setActive(0), [query])

  const choose = (i: number) => {
    useViewer.getState().select(i, true)
    setOpen(false)
    input.current?.blur()
  }

  return (
    <div className={`search${open && query ? ' has-results' : ''}`}>
      <Icon name="search" size={15} />
      <input
        ref={input}
        value={query}
        placeholder="Search nodes, routes, files…"
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive(Math.min(active + 1, hits.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive(Math.max(active - 1, 0))
          } else if (e.key === 'Enter' && hits[active]) {
            choose(hits[active].i)
          } else if (e.key === 'Escape') {
            setQuery('')
            input.current?.blur()
          }
        }}
        aria-label="Search the graph"
        data-testid="search"
      />
      <kbd>⌘K</kbd>
      {open && query && index && (
        <ul className="search-results" role="listbox">
          {hits.length === 0 && <li className="empty">No matches</li>}
          {hits.map((hit, k) => {
            const node = index.nodes[hit.i]
            const kind = index.kinds.get(node.kind)!
            const layer = index.layerById.get(node.layer)
            return (
              <li
                key={node.id}
                role="option"
                aria-selected={k === active}
                className={k === active ? 'active' : ''}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(hit.i)
                }}
                onMouseEnter={() => setActive(k)}
              >
                <ShapeIcon shape={kind.shape} color={kind.color} />
                <span className="result-label">{node.label}</span>
                <span className="result-meta">
                  {kind.label} · {layer?.label ?? node.layer}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
