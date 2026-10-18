import { useEffect, useMemo, useState } from 'react'
import { ErrorState } from '../../components/ErrorState'
import { ArrowLeftIcon, ArrowRightIcon } from '../../components/icons'
import { Loading, Skeleton, SkeletonList } from '../../components/Skeleton'
import { api, type Meeting } from '../../services/api'
import { dayKey, formatMeetingTime } from './format'
import { MeetingActions } from './MeetingActions'

type Result = { key: string } & ({ status: 'loaded'; meetings: Meeting[] } | { status: 'error' })

const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2024, 0, 1 + i)))

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

/**
 * The admin's meetings (Cal.com), above the messages: a month, each day with its meetings marked,
 * and the chosen day's meetings below, requests with Accept / Decline. Reminders go to the phone.
 */
export function MeetingsCalendar() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [today] = useState(() => dayKey(new Date()))
  const [selected, setSelected] = useState(today)
  const [retries, setRetries] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const days = useMemo(() => monthGrid(month), [month])
  const key = `${dayKey(month)}|${retries}`
  const state = result?.key === key ? result : null

  useEffect(() => {
    const controller = new AbortController()
    const from = days[0]
    const to = new Date(days.at(-1)!)
    to.setDate(to.getDate() + 1)
    api.meetings
      .list(from, to, controller.signal)
      .then((meetings) => setResult({ key, status: 'loaded', meetings }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, status: 'error' })
      })
    return () => controller.abort()
  }, [days, key])

  const byDay = useMemo(() => {
    const map = new Map<string, Meeting[]>()
    if (state?.status === 'loaded') for (const meeting of state.meetings) map.set(dayKey(new Date(meeting.startTime)), [...(map.get(dayKey(new Date(meeting.startTime))) ?? []), meeting])
    return map
  }, [state])
  const requests = state?.status === 'loaded' ? state.meetings.filter((m) => m.status === 'requested') : []
  const dayMeetings = byDay.get(selected) ?? []
  const monthName = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month)

  const update = (id: number, status: Meeting['status']) =>
    setResult((current) => (current?.status === 'loaded' ? { ...current, meetings: current.meetings.map((m) => (m.id === id ? { ...m, status } : m)) } : current))

  const goTo = (offset: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1))

  return (
    <section className="card meetings" aria-labelledby="meetings-title">
      <div className="inbox-header">
        <h2 id="meetings-title">Meetings</h2>
        <div className="meetings-month">
          <button type="button" className="icon-button" aria-label="Previous month" onClick={() => goTo(-1)}>
            <ArrowLeftIcon />
          </button>
          <span aria-live="polite">{monthName}</span>
          <button type="button" className="icon-button" aria-label="Next month" onClick={() => goTo(1)}>
            <ArrowRightIcon />
          </button>
        </div>
      </div>
      <p className="muted">Booked through Cal.com. Your phone reminds you a day, 2 hours and 5 minutes before each accepted meeting, and when it starts.</p>

      {state === null && (
        <Loading label="Loading meetings…">
          <Skeleton height={260} radius={12} />
          <SkeletonList rows={2} pill />
        </Loading>
      )}
      {state?.status === 'error' && <ErrorState message="Meetings couldn't be loaded." onRetry={() => setRetries((n) => n + 1)} />}
      {state?.status === 'loaded' && (
        <>
          {requests.length > 0 && (
            <p className="meetings-waiting" role="status">
              {requests.length === 1 ? '1 request is' : `${requests.length} requests are`} waiting for you this month.
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
            {Array.from({ length: days.length / 7 }, (_, week) => (
              <div key={week} className="calendar-row" role="row">
                {days.slice(week * 7, week * 7 + 7).map((day) => {
                  const k = dayKey(day)
                  const meetings = byDay.get(k) ?? []
                  const label = `${new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(day)}${meetings.length ? `, ${meetings.length} ${meetings.length === 1 ? 'meeting' : 'meetings'}` : ''}`
                  return (
                    <span key={k} role="gridcell" aria-selected={k === selected}>
                      <button
                        type="button"
                        className="calendar-day"
                        data-other-month={day.getMonth() !== month.getMonth() || undefined}
                        data-today={k === today || undefined}
                        aria-label={label}
                        aria-pressed={k === selected}
                        onClick={() => setSelected(k)}
                      >
                        {day.getDate()}
                        {meetings.length > 0 && (
                          <span className="calendar-dots" aria-hidden="true">
                            {meetings.slice(0, 3).map((m) => (
                              <span key={m.id} className={`calendar-dot calendar-dot-${m.status}`} />
                            ))}
                          </span>
                        )}
                      </button>
                    </span>
                  )
                })}
              </div>
            ))}
          </div>

          <h3 className="meetings-day-title">{new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${selected}T12:00:00`))}</h3>
          {dayMeetings.length === 0 ? (
            <p className="muted">No meetings this day.</p>
          ) : (
            <ul className="meetings-list">
              {dayMeetings.map((meeting) => (
                <li key={meeting.id} className="meeting">
                  <p className="meeting-when">{formatMeetingTime(meeting)}</p>
                  <p>
                    <strong>{meeting.attendeeName || meeting.attendeeEmail}</strong>{' '}
                    <a href={`mailto:${meeting.attendeeEmail}`} className="muted">
                      {meeting.attendeeEmail}
                    </a>
                  </p>
                  <p className="muted">{meeting.title}</p>
                  {meeting.notes && <p className="meeting-notes">“{meeting.notes}”</p>}
                  <MeetingActions meeting={meeting} onDecided={(status) => update(meeting.id, status)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
