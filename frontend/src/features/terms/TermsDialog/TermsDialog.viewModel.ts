import { useId, useRef } from 'react'
import { useAppDispatch } from '../../../store'
import { termsClosed } from '../../../store/termsSlice'
import { useTerms } from '../useTerms'

export function useTermsDialogViewModel() {
  const dispatch = useAppDispatch()
  const { state, reload } = useTerms()
  return {
    titleId: useId(),
    closeRef: useRef<HTMLButtonElement>(null),
    state,
    title: state.status === 'loaded' ? state.data.title : 'Terms and Conditions',
    reload,
    errorMessage: "The terms couldn't be loaded.",
    close: () => dispatch(termsClosed()),
  }
}
