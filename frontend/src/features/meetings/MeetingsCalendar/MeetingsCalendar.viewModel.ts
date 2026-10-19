import { useMemo, useState } from 'react'
import type { Meeting } from '../../../services/api'
import { useListMeetingsQuery } from '../../../store/api/meetingsApi'
import { toLoadable } from '../../../store/loadable'
import { dayKey } from '../format'

const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2024, 0, 1 + i)))
const LONG_DAY = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

/** The month's days, Monday first, padded with the neighbouring months' days to whole weeks. */
function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = new Date(first)
  start.setDate(1 - ((first.getDay() + 6) % 7))
  const days: Date[] = []
  for (let d = new Date(start); days.length < 42; d.setDate(d.getDate() + 1)) days.push(new Date(d))
  // Drop a last week that's all next month.
  return days[35].getMonth() !== month.getMonth() ? days.slice(0, 35) : days
}

/** One day in the grid, as the view shows it. */
export interface CalendarDay {
  key: string
  date: number
  otherMonth: boolean
  today: boolean
  selected: boolean
  label: string
  meetings: Meeting[]
  select: () => void
}

/** The month on show, its meetings by day, and the chosen day's. */
export function useMeetingsCalendarViewModel() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [today] = useState(() => dayKey(new Date()))
  const [selected, setSelected] = useState(today)
  const days = useMemo(() => monthGrid(month), [month])
  const range = useMemo(() => {
    const to = new Date(days.at(-1)!)
    to.setDate(to.getDate() + 1)
    return { from: days[0].toISOString(), to: to.toISOString() }
  }, [days])
  const query = useListMeetingsQuery(range)
  const state = toLoadable(query)
  const meetings = state.status === 'loaded' ? state.data : null

  const byDay = useMemo(() => {
    const map = new Map<string, Meeting[]>()
    for (const meeting of meetings ?? []) {
      const key = dayKey(new Date(meeting.startTime))
      map.set(key, [...(map.get(key) ?? []), meeting])
    }
    return map
  }, [meetings])

  const toDay = (day: Date): CalendarDay => {
    const key = dayKey(day)
    const dayMeetings = byDay.get(key) ?? []
    return {
      key,
      date: day.getDate(),
      otherMonth: day.getMonth() !== month.getMonth(),
      today: key === today,
      selected: key === selected,
      label: `${LONG_DAY.format(day)}${dayMeetings.length ? `, ${dayMeetings.length} ${dayMeetings.length === 1 ? 'meeting' : 'meetings'}` : ''}`,
      meetings: dayMeetings,
      select: () => setSelected(key),
    }
  }

  const goTo = (offset: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1))

  return {
    status: state.status,
    retry: () => void query.refetch(),
    monthName: new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month),
    previousMonth: () => goTo(-1),
    nextMonth: () => goTo(1),
    weekdays: WEEKDAYS,
    weeks: Array.from({ length: days.length / 7 }, (_, week) => days.slice(week * 7, week * 7 + 7).map(toDay)),
    requestCount: meetings?.filter((m) => m.status === 'requested').length ?? 0,
    selectedTitle: LONG_DAY.format(new Date(`${selected}T12:00:00`)),
    selectedMeetings: byDay.get(selected) ?? [],
  }
}
