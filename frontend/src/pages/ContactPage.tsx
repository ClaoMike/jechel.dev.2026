import { SignedIn, SignedOut, useAuth } from '../auth'
import { ContactForm } from '../features/contact/ContactForm'
import { MessagesInbox } from '../features/contact/MessagesInbox'
import { Loading, Skeleton } from '../components/Skeleton'

/** Visitors get the contact form; the signed-in admin gets the messages sent through it. */
export function ContactPage() {
  const { isLoading } = useAuth()

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
        <MessagesInbox />
      </SignedIn>
    </>
  )
}
