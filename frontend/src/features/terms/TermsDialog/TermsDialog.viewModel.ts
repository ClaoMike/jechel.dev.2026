import { useEffect, useId, useRef } from 'react'
import { useLocation } from 'react-router'
import { useAppDispatch } from '../../../store'
import { termsClosed } from '../../../store/termsSlice'
import { useTerms } from '../useTerms'

export function useTermsDialogViewModel() {
  const dispatch = useAppDispatch()
  const { state, reload } = useTerms()
  // A link in the terms to a page of the site (e.g. Contact) goes there: the popup makes way.
  const { pathname } = useLocation()
  const openedOn = useRef(pathname)
  useEffect(() => {
    if (pathname !== openedOn.current) dispatch(termsClosed())
  }, [pathname, dispatch])
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
