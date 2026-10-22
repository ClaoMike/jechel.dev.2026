import { useId, useState } from 'react'
import { useDragSort } from '../../../components/useDragSort'
import type { AppOrderItem } from '../../../services/api'
import { useGetAppOrderQuery, useSaveAppOrderMutation } from '../../../store/api/appsApi'
import { toLoadable } from '../../../store/loadable'
import { fieldErrorsOf, saveFailedMessage } from '../../../utils/saveErrors'
import { move, replaceAt } from '../../about/list'

export interface OrganiseDialogProps {
  onClose: () => void
}

/** A draft of the order, over the saved one; saved together. After a save it stays open, on the saved order. */
export function useOrganiseDialogViewModel({ onClose }: OrganiseDialogProps) {
  const query = useGetAppOrderQuery()
  const state = toLoadable(query)
  const saved = state.status === 'loaded' ? state.data : null
  // Null: no changes yet, the saved order shows (and follows it if it loads again).
  const [draft, setDraft] = useState<AppOrderItem[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState('')
  const [askDiscard, setAskDiscard] = useState(false)
  const [saveOrder, { isLoading: saving }] = useSaveAppOrderMutation()

  const items = draft ?? saved ?? []
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved)
  const change = (next: AppOrderItem[]) => {
    setDraft(next)
    setSavedNote('')
  }
  const sort = useDragSort(items.length, (from, to) => change(move(items, from, to)))

  async function save() {
    setMessage(null)
    const sent = draft
    try {
      await saveOrder(items).unwrap()
      // Back to the saved order, unless it was changed again while saving (that change waits for the next Save).
      setDraft((current) => (current === sent ? null : current))
      setSavedNote('Saved.')
    } catch (error) {
      const outOfDate = fieldErrorsOf(error)?.['']
      if (outOfDate) {
        // Apps were added or deleted meanwhile: this order can't be saved. Show the list as it is now, to arrange again.
        setDraft(null)
        void query.refetch()
      }
      setMessage(outOfDate ? "Apps were added or deleted meanwhile. Here's the list as it is now: arrange it again, then save." : saveFailedMessage(error))
    }
  }

  return {
    titleId: useId(),
    status: state.status,
    empty: saved !== null && saved.length === 0,
    retry: () => void query.refetch(),
    sort,
    // While dragging, in the order being shown.
    rows: sort.order.map((index, position) => {
      const item = items[index]
      return {
        ...item,
        position,
        setShowInWhatsNew: (on: boolean) => change(replaceAt(items, index, { ...item, showInWhatsNew: on })),
      }
    }),
    saving,
    canSave: dirty && !saving,
    saveLabel: saving ? 'Saving…' : 'Save',
    save: () => void save(),
    message,
    savedNote,
    requestClose: () => (dirty ? setAskDiscard(true) : onClose()),
    askDiscard,
    stopAskingDiscard: () => setAskDiscard(false),
  }
}
