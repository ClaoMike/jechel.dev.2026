import type { AppDetails } from '../../../services/api'
import { formatDate } from '../../../utils/formatDate'

/** The card's kind and date, for an app: when it was added. */
export function useLatestAppViewModel({ app }: { app: AppDetails }) {
  return { kind: 'New app', date: formatDate(app.createdAt), dateTime: app.createdAt, title: app.title }
}
