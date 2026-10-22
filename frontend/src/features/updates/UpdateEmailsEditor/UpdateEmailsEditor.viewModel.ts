import { skipToken } from '@reduxjs/toolkit/query'
import { useEffect, useMemo, useState } from 'react'
import type { TestResult, UpdateEmailKind, UpdateEmailWording } from '../../../services/api'
import {
  usePreviewUpdateEmailQuery,
  useGetUpdateEmailsQuery,
  useResetUpdateEmailsMutation,
  useSaveUpdateEmailsMutation,
  useTestUpdateEmailMutation,
} from '../../../store/api/communityApi'
import { toLoadable } from '../../../store/loadable'
import { fieldErrorsOf, saveFailedMessage, type FieldErrors } from '../../../utils/saveErrors'

/** How long typing pauses before the preview follows. */
export const PREVIEW_DELAY_MS = 400

/** Until the email inside has loaded and been measured. */
const DEFAULT_FRAME_HEIGHT = 560

export const KIND_NAMES: Record<UpdateEmailKind, string> = { confirm: 'Confirmation', video: 'New video', app: 'New app' }

const same = (a: UpdateEmailWording, b: UpdateEmailWording) => JSON.stringify(a) === JSON.stringify(b)

/** The value, once it has stopped changing for `delay` ms; the first one at once. */
function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value)
  const first = settled === null
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), first ? 0 : delay)
    return () => clearTimeout(timer)
  }, [value, delay, first])
  return settled
}

/**
 * The admin's wording of the emails subscribers get: a draft of all three, one shown at a time with a
 * live preview from the API (the same code that sends them, under glass: only to look at), saved as a whole,
 * and a test of the draft sent to the admin. Saving the defaults unchanged goes back to them, so later defaults apply too.
 */
export function useUpdateEmailsEditorViewModel() {
  const query = useGetUpdateEmailsQuery()
  const state = toLoadable(query)
  const document = state.status === 'loaded' ? state.data : null

  const [draft, setDraft] = useState<UpdateEmailWording | null>(null)
  const [kind, setKind] = useState<UpdateEmailKind>('confirm')
  const [saveErrors, setSaveErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState('')
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [frameHeight, setFrameHeight] = useState(DEFAULT_FRAME_HEIGHT)
  const [save, { isLoading: saving }] = useSaveUpdateEmailsMutation()
  const [reset, { isLoading: resetting }] = useResetUpdateEmailsMutation()
  const [test, { isLoading: testing }] = useTestUpdateEmailMutation()

  const wording = draft ?? document?.wording ?? null
  const changed = !!draft && !!document && !same(draft, document.wording)
  const isDefault = !!wording && !!document && same(wording, document.defaults)

  const current = useMemo(() => wording && { kind, wording }, [kind, wording])
  const shown = useSettled(current, PREVIEW_DELAY_MS)
  const preview = usePreviewUpdateEmailQuery(shown ?? skipToken)
  // The preview checks the draft as it's typed; a save's errors stand until the next change.
  const liveErrors = (preview.isError && fieldErrorsOf(preview.error)) || {}
  const errors = { ...liveErrors, ...saveErrors }

  function change(next: UpdateEmailWording) {
    setDraft(next)
    setSaveErrors({})
    setMessage('')
    setFailed('')
  }

  async function saveDraft() {
    if (!wording || !document) return
    setFailed('')
    setMessage('')
    try {
      // The defaults, unchanged: stored as "no wording of my own", so improved defaults reach the emails too.
      await (isDefault ? reset() : save(wording)).unwrap()
      setDraft(null)
      setSaveErrors({})
      setMessage('Saved. New emails use this wording.')
    } catch (error) {
      const fields = fieldErrorsOf(error)
      if (fields) {
        setSaveErrors(fields)
        setFailed('Some fields need a look.')
        // Show the first email with a problem.
        const first = Object.keys(fields)[0]?.split('.')[0]
        if (first === 'confirm' || first === 'video' || first === 'app') setKind(first)
      } else setFailed(saveFailedMessage(error))
    }
  }

  async function sendTest() {
    if (!wording) return
    setTestResult(null)
    try {
      setTestResult(await test({ kind, wording }).unwrap())
    } catch (error) {
      const fields = fieldErrorsOf(error)
      if (fields) setSaveErrors(fields)
      setTestResult({ ok: false, message: fields ? 'Fix the fields marked first.' : "The test couldn't be sent. Please try again." })
    }
  }

  return {
    state,
    retry: () => void query.refetch(),
    wording,
    kind,
    choose: (next: UpdateEmailKind) => {
      setKind(next)
      setTestResult(null)
    },
    change,
    errors,
    changed,
    updatedAt: document?.updatedAt ?? null,
    busy: saving || resetting,
    message,
    failed,
    save: () => void saveDraft(),
    discard: () => change(document!.wording),
    preview: {
      data: preview.data ?? null,
      /** The draft has changed since: the preview catches up after a pause. */
      stale: !!preview.data && (shown !== current || preview.isFetching || preview.isError),
      failed: preview.isError && !fieldErrorsOf(preview.error),
      /** The email's own height, so the whole of it shows under the glass, with nothing to scroll inside. */
      height: frameHeight,
      // The document's own box: its scroll height is never less than the frame's.
      fit: (frame: HTMLIFrameElement) => setFrameHeight(Math.ceil(frame.contentDocument?.documentElement.getBoundingClientRect().height ?? 0) || DEFAULT_FRAME_HEIGHT),
    },
    testing,
    testResult,
    sendTest: () => void sendTest(),
  }
}
