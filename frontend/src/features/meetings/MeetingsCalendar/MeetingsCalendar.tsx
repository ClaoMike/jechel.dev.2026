import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { ArrowLeftIcon, ArrowRightIcon } from '../../../components/icons/icons'
import { Loading, Skeleton, SkeletonList } from '../../../components/Skeleton'
import { formatMeetingTime } from '../format'
import { MeetingActions } from '../MeetingActions/MeetingActions'
import { useMeetingsCalendarViewModel } from './MeetingsCalendar.viewModel'

/**
 * The admin's meetings (Cal.com), above the messages: a month, each day with its meetings marked,
 * and the chosen day's meetings below, requests with Accept / Decline. Reminders go to the phone.
 */
export function MeetingsCalendar() {
  const vm = useMeetingsCalendarViewModel()

  return (
    <section className="card meetings" aria-labelledby="meetings-title">
      <div className="inbox-header">
        <h2 id="meetings-title">Meetings</h2>
        <div className="meetings-month">
          <button type="button" className="icon-button" aria-label="Previous month" onClick={vm.previousMonth}>
            <ArrowLeftIcon />
          </button>
          <span aria-live="polite">{vm.monthName}</span>
          <button type="button" className="icon-button" aria-label="Next month" onClick={vm.nextMonth}>
            <ArrowRightIcon />
          </button>
        </div>
      </div>
      <p className="muted">Booked through Cal.com. Your phone reminds you a day, 2 hours and 5 minutes before each accepted meeting, and when it starts.</p>

      {vm.status === 'loading' && (
        <Loading label="Loading meetings…">
          <Skeleton height={260} radius={12} />
          <SkeletonList rows={2} pill />
        </Loading>
      )}
      {vm.status === 'error' && <ErrorState message="Meetings couldn't be loaded." onRetry={vm.retry} />}
      {vm.status === 'loaded' && (
        <>
          {vm.requestCount > 0 && (
            <p className="meetings-waiting" role="status">
              {vm.requestCount === 1 ? '1 request is' : `${vm.requestCount} requests are`} waiting for you this month.
            </p>
          )}
          <div className="calendar" role="grid" aria-label={vm.monthName}>
            <div className="calendar-row" role="row">
              {vm.weekdays.map((name) => (
                <span key={name} className="calendar-weekday" role="columnheader">
                  {name}
                </span>
              ))}
            </div>
            {vm.weeks.map((week, w) => (
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

          <h3 className="meetings-day-title">{vm.selectedTitle}</h3>
          {vm.selectedMeetings.length === 0 ? (
            <p className="muted">No meetings this day.</p>
          ) : (
            <ul className="meetings-list">
              {vm.selectedMeetings.map((meeting) => (
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
