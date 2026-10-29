import { SignedIn, SignedOut } from '@/entities/session'
import { ContactForm } from './ContactForm/ContactForm'
import { MessagesInbox } from './MessagesInbox/MessagesInbox'
import { MeetingsCalendar } from './MeetingsCalendar/MeetingsCalendar'
import { Loading, Skeleton } from '@/shared/ui/Skeleton'
import { useAppSelector } from '@/shared/lib/store'
import { strings } from '@/shared/i18n'

/** Visitors get the contact form (meetings are by invitation: the booking link comes in an answer); the signed-in admin gets the meetings calendar and the messages. */
export function ContactPage() {
  // Until it's known who's here, the page shows the contact form's shape.
  const isLoading = useAppSelector((state) => state.auth.status === 'loading')

  return (
    <>
      {isLoading && (
        // Until we know who's here: the contact form's shape.
        <Loading label={strings.common.loading} className="card">
          <Skeleton width="40%" height={24} />
          {[1, 2].map((i) => (
            <div key={i} className="skeleton-text">
              <Skeleton width={80} height={12} />
              <Skeleton height={40} radius={10} />
            </div>
          ))}
          <Skeleton height={140} radius={10} />
          <Skeleton width={140} height={40} radius={999} />
        </Loading>
      )}
      <SignedOut>
        <ContactForm />
      </SignedOut>
      <SignedIn>
        <div className="admin-contact">
          <MeetingsCalendar />
          <MessagesInbox />
        </div>
      </SignedIn>
    </>
  )
}
