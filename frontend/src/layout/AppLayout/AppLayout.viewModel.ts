import { useCallback, useState } from 'react'
import { useFeature } from '../../features/site/useSite'
import { useAppSelector } from '../../store'
import { activePreview } from '../../store/previewSlice'
import { useScrollMemory } from '../useScrollMemory'
import { useSwipeNavigation } from '../useSwipeNavigation'

export function useAppLayoutViewModel({ downtime = false }: { downtime?: boolean } = {}) {
  // The admin's preview (normal / loading / error): changing it remounts what loads data (the keys
  // in the view), so their own state starts afresh too, as everything loads again (store/listeners).
  const preview = useAppSelector(activePreview)
  const theme = useAppSelector((state) => state.theme.theme)
  useScrollMemory()
  const updates = useFeature('updates')
  // Vice can hide the page to show off the scene; leaving Vice always brings the page back.
  const [hideContent, setHideContent] = useState(false)
  if (theme !== 'vice' && hideContent) setHideContent(false)
  // Swiping between pages, for everyone; not while the page is down or hidden.
  const pageRef = useSwipeNavigation(!downtime && !(theme === 'vice' && hideContent))
  const toggleContent = useCallback(() => setHideContent((hidden) => !hidden), [])
  // On phones, Vice's hide / show button sits in this slot in the header while the page shows (see ContentToggle).
  const [toggleSlot, setToggleSlot] = useState<HTMLSpanElement | null>(null)

  return {
    preview,
    vice: theme === 'vice',
    contentHidden: theme === 'vice' && hideContent,
    toggleContent,
    toggleSlot,
    toggleSlotRef: setToggleSlot,
    showUpdates: updates,
    pageRef,
  }
}
