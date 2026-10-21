import { CheckIcon } from '../../../../components/icons/icons'

/** The NeetCode lists completed, as ticked chips. */
export function NeetCodeLists({ lists }: { lists: string[] }) {
  return (
    <div className="neetcode">
      <h3 className="neetcode-title">NeetCode lists completed</h3>
      <ul className="chips" aria-label="NeetCode lists completed">
        {lists.map((list) => (
          <li key={list} className="chip neetcode-chip">
            <CheckIcon size={14} />
            {list}
          </li>
        ))}
      </ul>
    </div>
  )
}
