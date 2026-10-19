import { useState } from 'react'

export function useSubscribeButtonViewModel() {
  const [open, setOpen] = useState(false)
  return { open, show: () => setOpen(true), close: () => setOpen(false) }
}
