const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** An ISO 8601 timestamp from the API, in the viewer's locale and time zone, e.g. "Oct 8, 2026, 2:30 PM". */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso))
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

/** An ISO 8601 timestamp from the API as a date in the viewer's locale, e.g. "Oct 8, 2026". */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso))
}
