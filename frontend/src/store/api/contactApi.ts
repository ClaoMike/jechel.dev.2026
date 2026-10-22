import { api, type ContactMessageDetails, type ContactMessageSummary, type ContactReply, type Page, type SendMessageRequest } from '../../services/api'
import { baseApi, run, whenFulfilled } from '../baseApi'
import type { PageArgs } from './appsApi'

/** The contact form, and the admin's inbox. */
export const contactApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    sendMessage: build.mutation<void, SendMessageRequest>({ queryFn: (message) => run(api.contact.send(message)) }),

    listMessages: build.query<Page<ContactMessageSummary>, PageArgs>({
      queryFn: ({ page, pageSize }, { signal }) => run(api.contact.listMessages(page, pageSize, signal)),
      providesTags: ['Messages'],
    }),

    getMessage: build.query<ContactMessageDetails, number>({
      queryFn: async (id, { signal }) => {
        const result = await run(api.contact.getMessage(id, signal))
        // An older API (mid-deploy) has no replies or meetings yet.
        return 'data' in result ? { data: { ...result.data, replies: result.data.replies ?? [], meetings: result.data.meetings ?? [] } } : result
      },
      providesTags: (_, __, id) => [{ type: 'Message', id }],
    }),

    /** Shows it as read in every page of the inbox that's loaded (and in the message, so it isn't marked again). */
    markMessageRead: build.mutation<void, number>({
      queryFn: (id) => run(api.contact.markAsRead(id)),
      onQueryStarted: (id, { dispatch, getState, queryFulfilled }) =>
        whenFulfilled(queryFulfilled, () => {
          dispatch(
            contactApi.util.updateQueryData('getMessage', id, (message) => {
              message.readAt ??= new Date().toISOString()
            }),
          )
          for (const args of contactApi.util.selectCachedArgsForQuery(getState(), 'listMessages')) {
            dispatch(
              contactApi.util.updateQueryData('listMessages', args, (page) => {
                for (const message of page.items) if (message.id === id) message.isRead = true
              }),
            )
          }
        }),
    }),

    /** The inbox loads again: the next message moves up, and the total changes. */
    deleteMessage: build.mutation<void, number>({ queryFn: (id) => run(api.contact.deleteMessage(id)), invalidatesTags: ['Messages'] }),

    /** The answer joins the open conversation at once; the inbox loads again, so it moves up with one more message. */
    replyToMessage: build.mutation<ContactReply, { id: number; text: string }>({
      queryFn: ({ id, text }) => run(api.contact.reply(id, text)),
      invalidatesTags: (_, error) => (error ? [] : ['Messages']),
      onQueryStarted: ({ id }, { dispatch, queryFulfilled }) =>
        whenFulfilled(queryFulfilled, (reply) =>
          dispatch(
            contactApi.util.updateQueryData('getMessage', id, (message) => {
              message.replies.push(reply)
            }),
          ),
        ),
    }),
  }),
})

export const { useSendMessageMutation, useListMessagesQuery, useGetMessageQuery, useMarkMessageReadMutation, useDeleteMessageMutation, useReplyToMessageMutation } = contactApi
