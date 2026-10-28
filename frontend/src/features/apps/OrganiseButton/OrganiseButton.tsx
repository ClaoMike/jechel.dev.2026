import { useState } from 'react'
import { OrganiseDialog } from '../OrganiseDialog/OrganiseDialog'

/** The admin's Organise button above the Apps grid, and the popup it opens to order the apps. */
export function OrganiseButton() {
  const [organising, setOrganising] = useState(false)

  return (
    <>
      <button type="button" className="button button-secondary button-small" onClick={() => setOrganising(true)}>
        Organise
      </button>
      {organising && <OrganiseDialog onClose={() => setOrganising(false)} />}
    </>
  )
}
