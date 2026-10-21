import { useId } from 'react'
import { useGetVisitQuery } from '../../../store/api/analyticsApi'
import { toLoadable } from '../../../store/loadable'
import { formatDateTime } from '../../../utils/formatDate'

export function useVisitDialogViewModel(visitId: string) {
  const query = useGetVisitQuery(visitId)
  const state = toLoadable(query)
  return {
    titleId: useId(),
    state,
    title: state.status === 'loaded' ? `Visit on ${formatDateTime(state.data.startedAt)}` : 'Visit',
    retry: () => void query.refetch(),
  }
}
