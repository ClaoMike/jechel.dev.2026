import { strings } from '@/shared/i18n'

export interface DifficultyRow {
  key: string
  label: string
  /** Formatted: "1,234". */
  solved: string
  total: string
  /** How far the bar fills, 0 to 100. */
  percent: number
}

/** Solved out of all, per difficulty, with a bar each. */
export function DifficultyBreakdown({ rows }: { rows: DifficultyRow[] }) {
  return (
    <ul className="leetcode-difficulties" aria-label={strings.difficultyBreakdown.solvedDifficulty}>
      {rows.map((row) => (
        <li key={row.key} className={`leetcode-difficulty leetcode-${row.key}`}>
          <span className="leetcode-difficulty-name">{row.label}</span>
          <span className="leetcode-difficulty-count">
            <strong>{row.solved}</strong>
            <span className="muted"> / {row.total}</span>
          </span>
          <span className="leetcode-bar" aria-hidden="true">
            <span style={{ width: `${row.percent}%` }} />
          </span>
        </li>
      ))}
    </ul>
  )
}
