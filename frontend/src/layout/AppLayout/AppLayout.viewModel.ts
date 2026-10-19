import { useCallback, useRef, useState } from 'react'
import { useFeature } from '../../features/site/useSite'
import { useAppSelector } from '../../store'
import { activePreview } from '../../store/previewSlice'
import { useScrollMemory } from '../useScrollMemory'

export function useAppLayoutViewModel() {
  // The admin's preview (normal / loading / error): changing it remounts what loads data (the keys
  // in the view), so their own state starts afresh too, as everything loads again (store/listeners).
  const preview = useAppSelector(activePreview)
  const theme = useAppSelector((state) => state.theme.theme)
  useScrollMemory()
  const updates = useFeature('updates')
  // Vice can hide the page to show off the scene; leaving Vice always brings the page back.
  const [hideContent, setHideContent] = useState(false)
  if (theme !== 'vice' && hideContent) setHideContent(false)
  const toggleContent = useCallback(() => setHideContent((hidden) => !hidden), [])
  // On phones, Vice's hide / show button sits here (pinned over this slot; see ContentToggle).
  const toggleSlot = useRef<HTMLSpanElement>(null)

  return {
    preview,
    vice: theme === 'vice',
    contentHidden: theme === 'vice' && hideContent,
    toggleContent,
    toggleSlotRef: toggleSlot,
    showUpdates: updates,
  }
}
