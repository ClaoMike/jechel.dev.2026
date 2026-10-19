import { useState, type MouseEvent } from 'react'
import { useDeleteVisitMutation, useListVisitsQuery } from '../../../store/api/analyticsApi'
import { usePagedQuery } from '../../../store/usePagedQuery'

export const VISITS_PAGE_SIZE = 20

/** A page of visits (its own page number: not in the URL), the errors-only filter, and the visit that's open. */
export function useVisitsTableViewModel() {
  const [page, setPage] = useState(1)
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const { state, totalPages, retry } = usePagedQuery(useListVisitsQuery, { page, pageSize: VISITS_PAGE_SIZE, errorsOnly }, setPage)
  const [deleteVisit] = useDeleteVisitMutation()

  return {
    state,
    page,
    totalPages,
    setPage,
    retry,
    errorsOnly,
    setErrorsOnly: (on: boolean) => {
      setErrorsOnly(on)
      setPage(1)
    },
    open,
    openVisit: setOpen,
    rowClicked: (event: MouseEvent, id: string) => {
      if (!(event.target as HTMLElement).closest('button')) setOpen(id)
    },
    close: () => setOpen(null),
    // The numbers and the list load again (store tags).
    deleteVisit: async (id: string) => {
      await deleteVisit(id).unwrap()
      setOpen(null)
    },
  }
}
