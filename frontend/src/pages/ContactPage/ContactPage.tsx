import { SignedIn, SignedOut } from '../../auth'
import { ContactForm } from '../../features/contact/ContactForm/ContactForm'
import { MessagesInbox } from '../../features/contact/MessagesInbox/MessagesInbox'
import { MeetingsCalendar } from '../../features/meetings/MeetingsCalendar/MeetingsCalendar'
import { Loading, Skeleton } from '../../components/Skeleton'
import { useAppSelector } from '../../store'

/** Visitors get the contact form (meetings are by invitation: the booking link comes in an answer); the signed-in admin gets the meetings calendar and the messages. */
export function ContactPage() {
  // Until it's known who's here, the page shows the contact form's shape.
  const isLoading = useAppSelector((state) => state.auth.status === 'loading')

  return (
    <>
      {isLoading && (
        // Until we know who's here: the contact form's shape.
        <Loading label="Loading…" className="card">
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
