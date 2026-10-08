import { SignedIn, SignedOut, useAuth } from '../auth'
import { ContactForm } from '../features/contact/ContactForm'
import { MessagesInbox } from '../features/contact/MessagesInbox'

/** Visitors get the contact form; the signed-in admin gets the messages sent through it. */
export function ContactPage() {
  const { isLoading } = useAuth()

  return (
    <>
      {isLoading && <p>Loading…</p>}
      <SignedOut>
        <ContactForm />
      </SignedOut>
      <SignedIn>
        <MessagesInbox />
      </SignedIn>
    </>
  )
}
