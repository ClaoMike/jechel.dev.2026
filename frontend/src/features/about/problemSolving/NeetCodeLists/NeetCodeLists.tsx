import { CheckIcon } from '../../../../components/icons/icons'
import { strings } from '../../../../strings'

/** The NeetCode lists completed, as ticked chips. */
export function NeetCodeLists({ lists }: { lists: string[] }) {
  return (
    <div className="neetcode">
      <h3 className="neetcode-title">{strings.neetCodeLists.neetcodeListsCompleted}</h3>
      <ul className="chips" aria-label={strings.neetCodeLists.neetcodeListsCompleted}>
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
