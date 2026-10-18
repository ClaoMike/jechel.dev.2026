import { useState } from 'react'
import { BellIcon } from '../../components/icons'
import { SubscribeDialog } from './SubscribeDialog'

/** "Get updates" in the header: opens the subscribe popup. */
export function SubscribeButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="button button-secondary header-button" aria-label="Get updates by email" onClick={() => setOpen(true)}>
        <BellIcon />
        <span className="header-button-label">Get updates</span>
      </button>
      {open && <SubscribeDialog onClose={() => setOpen(false)} />}
    </>
  )
}
