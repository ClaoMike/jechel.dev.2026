import { api, type Meeting, type MeetingDecision } from '../../services/api'
import { baseApi, run, whenFulfilled } from '../baseApi'
import { contactApi } from './contactApi'

/** [from, to) as ISO 8601 timestamps (the store keeps plain data, not Dates). */
export interface MeetingRange {
  from: string
  to: string
}

/** Cal.com meetings, by invitation: the admin's booking link (to send in an answer), and calendar. */
export const meetingsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Admin only. The booking page to send ("https://cal.com/you/30min"), or "" when none is set. */
    getBookingLink: build.query<string, void>({
      queryFn: (_, { signal }) => run(api.meetings.info(signal)),
      // Asked again when the Cal.com page is saved in Settings (store/listeners.ts).
      providesTags: ['MeetingsLink'],
    }),

    listMeetings: build.query<Meeting[], MeetingRange>({
      queryFn: ({ from, to }, { signal }) => run(api.meetings.list(new Date(from), new Date(to), signal)),
      providesTags: ['Meetings'],
    }),

    /** Accepts or declines; the calendar and the messages that show the meeting update. */
    decideMeeting: build.mutation<MeetingDecision, { id: number; accept: boolean; message: string }>({
      queryFn: ({ id, accept, message }) => run(api.meetings.decide(id, accept, message)),
      onQueryStarted: ({ id }, { dispatch, getState, queryFulfilled }) =>
        whenFulfilled(queryFulfilled, ({ status }) => {
          const setStatus = (meetings: Meeting[]) => {
            for (const meeting of meetings) if (meeting.id === id) meeting.status = status
          }
          for (const args of meetingsApi.util.selectCachedArgsForQuery(getState(), 'listMeetings')) {
            dispatch(meetingsApi.util.updateQueryData('listMeetings', args, setStatus))
          }
          for (const messageId of contactApi.util.selectCachedArgsForQuery(getState(), 'getMessage')) {
            dispatch(contactApi.util.updateQueryData('getMessage', messageId, (message) => setStatus(message.meetings)))
          }
        }),
    }),
  }),
})

export const { useGetBookingLinkQuery, useListMeetingsQuery, useDecideMeetingMutation } = meetingsApi
