import type { Qualification } from '../../../../services/api'
import { formatMonth } from '../../format'

export interface QualificationView {
  title: string
  issuer: string
  /** "Jun 2021" and "2021-06", when there's a date. */
  obtained: { text: string; dateTime: string } | null
  grade: string
}

/** The qualifications, ready to show. */
export function useQualificationsSectionViewModel(value: Qualification[]) {
  return {
    items: value.map(
      (item): QualificationView => ({
        title: item.title,
        issuer: item.issuer,
        obtained: item.obtained ? { text: formatMonth(item.obtained), dateTime: item.obtained.slice(0, 7) } : null,
        grade: item.grade ? `Grade: ${item.grade}` : '',
      }),
    ),
  }
}
