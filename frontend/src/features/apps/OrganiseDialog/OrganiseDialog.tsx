import { useId, useState } from 'react'
import { DiscardChangesDialog } from '../../../components/DiscardChangesDialog/DiscardChangesDialog'
import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { GripIcon } from '../../../components/icons/icons'
import { Modal } from '../../../components/Modal/Modal'
import { OnOffSwitch } from '../../../components/OnOffSwitch/OnOffSwitch'
import { Loading, Skeleton } from '../../../components/Skeleton'
import { useDragSort } from '../../../components/useDragSort'
import type { AppOrderItem } from '../../../services/api'
import { useGetAppOrderQuery, useSaveAppOrderMutation } from '../../../store/api/appsApi'
import { toLoadable } from '../../../store/loadable'
import { fieldErrorsOf, saveFailedMessage } from '../../../utils/saveErrors'
import { move, replaceAt } from '../../about/list'
import { strings } from '../../../strings'

export interface OrganiseDialogProps {
  onClose: () => void
}

/**
 * The admin's order of the apps: drag them (or use the arrow keys on a handle) into the order the Apps page
 * shows, and choose which What's new? may show (it shows the first one in the order that's on). Save, top left,
 * once something changed. Only × closes it, asking first if there are changes not saved.
 */
export function OrganiseDialog(props: OrganiseDialogProps) {
  // A draft of the order, over the saved one; saved together. After a save it stays open, on the saved order.
  const { onClose } = props
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
      setSavedNote(strings.common.saved)
    } catch (error) {
      const outOfDate = fieldErrorsOf(error)?.['']
      if (outOfDate) {
        // Apps were added or deleted meanwhile: this order can't be saved. Show the list as it is now, to arrange
        // again.
        setDraft(null)
        void query.refetch()
      }
      setMessage(outOfDate ? strings.organiseDialog.appsWereAddedDeleted : saveFailedMessage(error))
    }
  }
  const titleId = useId()
  const status = state.status
  const empty = saved !== null && saved.length === 0
  const retry = () => void query.refetch()
  // While dragging, in the order being shown.
  const rows = sort.order.map((index, position) => {
    const item = items[index]
    return {
      ...item,
      position,
      setShowInWhatsNew: (on: boolean) => change(replaceAt(items, index, { ...item, showInWhatsNew: on })),
    }
  })
  const canSave = dirty && !saving
  const saveLabel = saving ? strings.common.saving : strings.common.save
  const requestClose = () => (dirty ? setAskDiscard(true) : onClose())
  const stopAskingDiscard = () => setAskDiscard(false)

  return (
    <Modal labelledBy={titleId} onClose={requestClose} dismissible={false} className="organise-dialog">
      <div className="modal-header organise-header">
        <button type="button" className="button button-small" onClick={() => void save()} disabled={!canSave}>
          {saveLabel}
        </button>
        <h2 id={titleId}>{strings.organiseDialog.organiseApps}</h2>
        <button type="button" className="icon-button" onClick={requestClose} aria-label={strings.common.close}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <p className="muted editor-note">{strings.organiseDialog.appsPageShowsThem}</p>
      {status === 'loading' && (
        <Loading label={strings.organiseDialog.loadingApps}>
          {[48, 36, 56].map((width, i) => (
            <div key={i} className="organise-row">
              <Skeleton width={`${width}%`} height={16} />
              <Skeleton width={96} height={36} radius={999} />
            </div>
          ))}
        </Loading>
      )}
      {status === 'error' && <ErrorState message={strings.organiseDialog.appsCantLoadedRight} onRetry={retry} />}
      {empty && <p className="muted">{strings.organiseDialog.noAppsYet}</p>}
      {rows.length > 0 && (
        <>
          <p className="organise-columns muted" aria-hidden="true">
            {strings.organiseDialog.whatsNew}
          </p>
          <ol className={sort.dragging ? 'organise-list organise-list-dragging' : 'organise-list'} aria-label={strings.organiseDialog.appsOrder}>
            {rows.map((row) => (
              <li key={row.id} className="organise-row" {...sort.itemProps(row.position)}>
                <button type="button" className="icon-button organise-handle" {...sort.handleProps(row.position, row.title)}>
                  <GripIcon size={16} />
                </button>
                <span className="organise-number muted" aria-hidden="true">
                  {row.position + 1}
                </span>
                <span className="organise-title">{row.title}</span>
                <OnOffSwitch label={strings.organiseDialog.showWhatsNew(row.title)} on={row.showInWhatsNew} onChange={row.setShowInWhatsNew} disabled={saving} />
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="visually-hidden" aria-live="polite">
        {sort.announcement}
      </p>
      {message && (
        <p className="field-error" role="alert">
          {message}
        </p>
      )}
      <p className="visually-hidden" role="status">
        {savedNote}
      </p>
      {askDiscard && <DiscardChangesDialog detail={strings.organiseDialog.newOrderAppsIsnt} onDiscard={props.onClose} onClose={stopAskingDiscard} />}
    </Modal>
  )
}
