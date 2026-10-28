import { useState } from 'react'
import { BellIcon } from '../../../components/icons/icons'
import { SubscribeDialog } from '../SubscribeDialog/SubscribeDialog'
import { strings } from '../../../strings'

/** "Get updates" in the header: opens the subscribe popup. */
export function SubscribeButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="button button-secondary header-button subscribe-button" aria-label={strings.subscribeButton.getUpdatesEmail} onClick={() => setOpen(true)}>
        <BellIcon />
        <span className="header-button-label">{strings.common.getUpdates}</span>
      </button>
      {open && <SubscribeDialog onClose={() => setOpen(false)} />}
    </>
  )
}
