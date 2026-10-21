import { useState } from 'react'

/** Whether the confirmation popup is up. */
export function useDeleteButtonViewModel() {
  const [asking, setAsking] = useState(false)
  return { asking, ask: () => setAsking(true), stopAsking: () => setAsking(false) }
}
