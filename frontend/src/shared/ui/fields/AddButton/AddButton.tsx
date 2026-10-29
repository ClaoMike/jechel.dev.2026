import type { ReactNode } from 'react'
import { PlusIcon } from '../../icons'

/** "+ Add …" under an editable list. */
export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="button button-secondary button-small add-button" onClick={onClick}>
      <PlusIcon size={16} />
      {children}
    </button>
  )
}
