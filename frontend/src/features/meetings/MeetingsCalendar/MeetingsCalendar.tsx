import { useMemo, useState } from 'react'
import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { ArrowLeftIcon, ArrowRightIcon } from '../../../components/icons/icons'
import { Loading, Skeleton, SkeletonList } from '../../../components/Skeleton'
import { formatMeetingTime, dayKey } from '../format'
import { MeetingActions } from '../MeetingActions/MeetingActions'
import type { Meeting } from '../../../services/api'
import { useListMeetingsQuery } from '../../../store/api/meetingsApi'
import { toLoadable } from '../../../store/loadable'
import { strings } from '../../../strings'

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

/**
 * The admin's meetings (Cal.com), above the messages: a month, each day with its meetings marked,
 * and the chosen day's meetings below, requests with Accept / Decline. Reminders go to the phone.
 */
export function MeetingsCalendar() {
  // The month on show, its meetings by day, and the chosen day's.
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
      label: strings.meetingsCalendar.dayLabel(LONG_DAY.format(day), dayMeetings.length),
      meetings: dayMeetings,
      select: () => setSelected(key),
    }
  }

  const goTo = (offset: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1))
  const status = state.status
  const retry = () => void query.refetch()
  const monthName = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month)
  const previousMonth = () => goTo(-1)
  const nextMonth = () => goTo(1)
  const weeks = Array.from({ length: days.length / 7 }, (_, week) => days.slice(week * 7, week * 7 + 7).map(toDay))
  const requestCount = meetings?.filter((m) => m.status === 'requested').length ?? 0
  const selectedTitle = LONG_DAY.format(new Date(`${selected}T12:00:00`))
  const selectedMeetings = byDay.get(selected) ?? []

  return (
    <section className="card meetings" aria-labelledby="meetings-title">
      <div className="inbox-header">
        <h2 id="meetings-title">{strings.meetingsCalendar.meetings}</h2>
        <div className="meetings-month">
          <button type="button" className="icon-button" aria-label={strings.meetingsCalendar.previousMonth} onClick={previousMonth}>
            <ArrowLeftIcon />
          </button>
          <span aria-live="polite">{monthName}</span>
          <button type="button" className="icon-button" aria-label={strings.meetingsCalendar.nextMonth} onClick={nextMonth}>
            <ArrowRightIcon />
          </button>
        </div>
      </div>
      <p className="muted">{strings.meetingsCalendar.bookedThroughCalCom}</p>

      {status === 'loading' && (
        <Loading label={strings.meetingsCalendar.loadingMeetings}>
          <Skeleton height={260} radius={12} />
          <SkeletonList rows={2} pill />
        </Loading>
      )}
      {status === 'error' && <ErrorState message={strings.meetingsCalendar.meetingsCouldntLoaded} onRetry={retry} />}
      {status === 'loaded' && (
        <>
          {requestCount > 0 && (
            <p className="meetings-waiting" role="status">
              {requestCount === 1 ? strings.meetingsCalendar.n1Request : strings.meetingsCalendar.requestsAre(requestCount)} {strings.meetingsCalendar.waitingMonth}
            </p>
          )}
          <div className="calendar" role="grid" aria-label={monthName}>
            <div className="calendar-row" role="row">
              {WEEKDAYS.map((name) => (
                <span key={name} className="calendar-weekday" role="columnheader">
                  {name}
                </span>
              ))}
            </div>
            {weeks.map((week, w) => (
              <div key={w} className="calendar-row" role="row">
                {week.map((day) => (
                  <span key={day.key} role="gridcell" aria-selected={day.selected}>
                    <button
                      type="button"
                      className="calendar-day"
                      data-other-month={day.otherMonth || undefined}
                      data-today={day.today || undefined}
                      aria-label={day.label}
                      aria-pressed={day.selected}
                      onClick={day.select}
                    >
                      {day.date}
                      {day.meetings.length > 0 && (
                        <span className="calendar-dots" aria-hidden="true">
                          {day.meetings.slice(0, 3).map((m) => (
                            <span key={m.id} className={`calendar-dot calendar-dot-${m.status}`} />
                          ))}
                        </span>
                      )}
                    </button>
                  </span>
                ))}
              </div>
            ))}
          </div>

          <h3 className="meetings-day-title">{selectedTitle}</h3>
          {selectedMeetings.length === 0 ? (
            <p className="muted">{strings.meetingsCalendar.noMeetingsDay}</p>
          ) : (
            <ul className="meetings-list">
              {selectedMeetings.map((meeting) => (
                <li key={meeting.id} className="meeting">
                  <p className="meeting-when">{formatMeetingTime(meeting)}</p>
                  <p>
                    <strong>{meeting.attendeeName || meeting.attendeeEmail}</strong>{' '}
                    <a href={`mailto:${meeting.attendeeEmail}`} className="muted">
                      {meeting.attendeeEmail}
                    </a>
                    {/* Meetings are by invitation: someone who never wrote got the link elsewhere. */}
                    {meeting.fromConversation === false && <span className="chip meeting-stranger">{strings.meetingsCalendar.notConversation}</span>}
                  </p>
                  <p className="muted">{meeting.title}</p>
                  {meeting.notes && <p className="meeting-notes">“{meeting.notes}”</p>}
                  <MeetingActions meeting={meeting} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
