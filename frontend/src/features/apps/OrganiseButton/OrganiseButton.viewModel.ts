import { useState } from 'react'

export function useOrganiseButtonViewModel() {
  const [organising, setOrganising] = useState(false)

  return {
    organising,
    open: () => setOrganising(true),
    close: () => setOrganising(false),
  }
}
