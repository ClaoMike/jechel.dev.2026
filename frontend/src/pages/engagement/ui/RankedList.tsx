import type { NamedCount } from '@/shared/api'
import { formatCount } from '../lib/format'
import { strings } from '@/shared/i18n'

/** A top-10 list with a bar per row, scaled to the first (biggest) one. */
export function RankedList({ title, items, empty = strings.rankedList.nothingYet }: { title: string; items: NamedCount[]; empty?: string }) {
  const max = items[0]?.count ?? 0
  return (
    <section className="card ranked-list" aria-label={title}>
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ol>
          {items.map((item) => (
            <li key={item.name}>
              <span className="ranked-name" title={item.name}>
                {item.name}
              </span>
              <span className="ranked-count">{formatCount(item.count)}</span>
              <span className="ranked-bar" style={{ width: `${Math.max(2, (item.count / max) * 100)}%` }} aria-hidden="true" />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
