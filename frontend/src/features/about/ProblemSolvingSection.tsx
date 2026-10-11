import { useEffect, useState } from 'react'
import { CheckIcon, LeetCodeIcon } from '../../components/icons'
import { ApiError, api, NEETCODE_LISTS, type LeetCodeStats, type ProblemSolving } from '../../services/api'
import { EditableSection } from './EditableSection'
import { TextField, type EditorProps } from './fields'
import { DIFFICULTIES, DIFFICULTY_LABELS, leetCodeProfileUrl, leetCodeUsernameFrom, NEETCODE_LIST_LABELS, STALE_AFTER_MS, toggleList } from './problemSolving'

/** LeetCode stats, fetched through the API, and the NeetCode lists completed. */
export function ProblemSolvingSection({ value, canEdit, onSave }: { value: ProblemSolving; canEdit: boolean; onSave: (value: ProblemSolving) => Promise<void> }) {
  const empty = !value.leetCodeUsername && value.neetCodeLists.length === 0
  return (
    <EditableSection title="Problem solving" errorKeys={['problemSolving']} value={value} canEdit={canEdit} onSave={onSave} editor={ProblemSolvingEditor}>
      {empty ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <div className="problem-solving">
          {value.leetCodeUsername && <LeetCodeCard key={value.leetCodeUsername} username={value.leetCodeUsername} canEdit={canEdit} />}
          {value.neetCodeLists.length > 0 && (
            <div className="neetcode">
              <h3 className="neetcode-title">NeetCode lists completed</h3>
              <ul className="chips" aria-label="NeetCode lists completed">
                {value.neetCodeLists.map((list) => (
                  <li key={list} className="chip neetcode-chip">
                    <CheckIcon size={14} />
                    {NEETCODE_LIST_LABELS[list]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </EditableSection>
  )
}

type Load = { status: 'loading' } | { status: 'loaded'; stats: LeetCodeStats; stale: boolean } | { status: 'not-found' } | { status: 'unavailable' }

/** Loads the stats once; keyed by username, so a new username starts afresh. */
function LeetCodeCard({ username, canEdit }: { username: string; canEdit: boolean }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    api.leetcode
      .get(controller.signal)
      .then((stats) =>
        setLoad(stats ? { status: 'loaded', stats, stale: Date.now() - new Date(stats.fetchedAt).getTime() > STALE_AFTER_MS } : { status: 'unavailable' }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad({ status: error instanceof ApiError && error.status === 404 ? 'not-found' : 'unavailable' })
      })
    return () => controller.abort()
  }, [username])

  // A wrong username is the admin's to fix; visitors just don't see the card.
  if (load.status === 'not-found') return canEdit ? <p className="field-error">LeetCode has no user called {username}. Check the username with Edit.</p> : null

  const profile = (
    <a className="leetcode-profile" href={leetCodeProfileUrl(username)} target="_blank" rel="noopener noreferrer">
      <LeetCodeIcon size={20} />
      LeetCode
      <span className="muted">@{load.status === 'loaded' ? load.stats.username : username}</span>
    </a>
  )

  if (load.status === 'loading')
    return (
      <div className="leetcode">
        {profile}
        <p className="muted">Loading LeetCode stats…</p>
      </div>
    )
  if (load.status === 'unavailable')
    return (
      <div className="leetcode">
        {profile}
        <p className="muted">LeetCode stats can't be loaded right now.</p>
      </div>
    )

  const { solved, total, fetchedAt } = load.stats
  return (
    <div className="leetcode">
      {profile}
      <div className="leetcode-body">
        <SolvedRing solved={solved} />
        <ul className="leetcode-difficulties" aria-label="Solved by difficulty">
          {DIFFICULTIES.map((difficulty) => (
            <li key={difficulty} className={`leetcode-difficulty leetcode-${difficulty}`}>
              <span className="leetcode-difficulty-name">{DIFFICULTY_LABELS[difficulty]}</span>
              <span className="leetcode-difficulty-count">
                <strong>{solved[difficulty].toLocaleString('en-GB')}</strong>
                <span className="muted"> / {total[difficulty].toLocaleString('en-GB')}</span>
              </span>
              <span className="leetcode-bar" aria-hidden="true">
                <span style={{ width: `${total[difficulty] ? Math.min(100, (solved[difficulty] / total[difficulty]) * 100) : 0}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </div>
      {load.stale && <p className="muted leetcode-stale">As of {new Date(fetchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.</p>}
    </div>
  )
}

/** The total solved, in a ring split by difficulty like LeetCode's own. */
function SolvedRing({ solved }: { solved: LeetCodeStats['solved'] }) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const gap = 4
  // Each difficulty's arc starts where the previous one ended.
  const arcs = DIFFICULTIES.map((difficulty) => ({ difficulty, length: solved.all ? (solved[difficulty] / solved.all) * circumference : 0 }))
  const starts = arcs.map((_, i) => arcs.slice(0, i).reduce((sum, arc) => sum + arc.length, 0))
  return (
    <div className="leetcode-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="leetcode-ring-track" cx="60" cy="60" r={radius} />
        {arcs.map(
          ({ difficulty, length }, i) =>
            length > 0 && (
              <circle
                key={difficulty}
                className={`leetcode-ring-segment leetcode-${difficulty}`}
                cx="60"
                cy="60"
                r={radius}
                strokeDasharray={`${Math.max(0, length - gap)} ${circumference}`}
                strokeDashoffset={-starts[i]}
              />
            ),
        )}
      </svg>
      <p className="leetcode-ring-label">
        <strong>{solved.all.toLocaleString('en-GB')}</strong>
        <span>solved</span>
      </p>
    </div>
  )
}

function ProblemSolvingEditor({ value, onChange, errors }: EditorProps<ProblemSolving>) {
  return (
    <div className="editor-list">
      <TextField
        label="LeetCode username"
        value={value.leetCodeUsername}
        onChange={(input) => onChange({ ...value, leetCodeUsername: leetCodeUsernameFrom(input) })}
        error={errors['problemSolving.leetCodeUsername']}
        hint="As in leetcode.com/u/username (pasting the profile link works too). Leave empty to hide the stats."
        placeholder="e.g. neetcode"
      />
      <fieldset className="editor-item">
        <legend>NeetCode lists completed</legend>
        <p className="muted editor-note">Click the ones you've completed.</p>
        <div className="licence-toggles">
          {NEETCODE_LISTS.map((list) => (
            <button
              key={list}
              type="button"
              className="licence-toggle"
              aria-pressed={value.neetCodeLists.includes(list)}
              onClick={() => onChange({ ...value, neetCodeLists: toggleList(value.neetCodeLists, list) })}
            >
              {NEETCODE_LIST_LABELS[list]}
            </button>
          ))}
        </div>
        {errors['problemSolving.neetCodeLists'] && <p className="field-error">{errors['problemSolving.neetCodeLists']}</p>}
      </fieldset>
      {errors.problemSolving && <p className="field-error">{errors.problemSolving}</p>}
    </div>
  )
}
