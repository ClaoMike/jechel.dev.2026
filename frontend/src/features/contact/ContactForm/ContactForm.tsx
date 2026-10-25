import type { ContactTopic } from '../../../services/api'
import { EMAIL_MAX_LENGTH, MESSAGE_MAX_LENGTH, MESSAGE_MIN_LENGTH, NAME_MAX_LENGTH } from '../contactRules'
import { useContactFormViewModel } from './ContactForm.viewModel'

/**
 * The public "Contact me" form. Send stays off until every field is right; a field's error shows once it's left. Once Work with me is
 * switched on, it asks what the message is about; Work with me's own form is about a project (`topic`), with its own
 * title and words.
 */
export function ContactForm({
  topic,
  title = 'Contact me',
  intro = "Have a question or an idea? Send me a message and I'll reply by email. All fields are required.",
}: {
  topic?: ContactTopic
  title?: string
  intro?: string
}) {
  const vm = useContactFormViewModel({ topic })
  const { id, errors, fieldProps } = vm

  if (vm.status === 'sent') {
    return (
      <section className="card contact-sent" aria-labelledby={`${id}-sent`}>
        <h2 id={`${id}-sent`}>Thank you!</h2>
        <p role="status">Your message was sent. I'll get back to you at {vm.sentTo}.</p>
        <button type="button" className="button button-secondary" onClick={vm.reset}>
          Send another message
        </button>
      </section>
    )
  }

  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      <p className="muted">{intro}</p>

      <form className="contact-form" noValidate onSubmit={vm.submit}>
        <div className="field">
          <label htmlFor={`${id}-name`}>Name</label>
          <input {...fieldProps('name')} type="text" autoComplete="name" maxLength={NAME_MAX_LENGTH} onChange={(e) => vm.update('name', e.target.value)} />
          <FieldError id={`${id}-name-error`} error={errors.name} />
        </div>

        <div className="field">
          <label htmlFor={`${id}-email`}>Email</label>
          <input {...fieldProps('email')} type="email" autoComplete="email" maxLength={EMAIL_MAX_LENGTH} onChange={(e) => vm.update('email', e.target.value)} />
          <FieldError id={`${id}-email-error`} error={errors.email} />
        </div>

        {vm.showTopic && (
          <div className="field">
            <label htmlFor={`${id}-topic`}>What's it about?</label>
            <select id={`${id}-topic`} className="select" value={vm.topic} onChange={(e) => vm.setTopic(e.target.value as ContactTopic | '')}>
              <option value="">A question, or anything else</option>
              <option value="project">A project: working with me</option>
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor={`${id}-message`}>Message</label>
          <textarea {...fieldProps('message')} rows={8} maxLength={MESSAGE_MAX_LENGTH} onChange={(e) => vm.update('message', e.target.value)} />
          <div className="field-hint" id={`${id}-message-hint`}>
            <span>
              Between {MESSAGE_MIN_LENGTH} and {MESSAGE_MAX_LENGTH} characters.
            </span>
            <span className={vm.messageShort ? 'counter counter-short' : 'counter'}>
              {vm.messageLength} / {MESSAGE_MAX_LENGTH}
            </span>
          </div>
          <FieldError id={`${id}-message-error`} error={errors.message} />
        </div>

        {vm.status === 'failed' && (
          <p role="alert" className="form-error">
            Your message couldn't be sent. Please try again in a moment.
          </p>
        )}
        {vm.status === 'tooMany' && (
          <p role="alert" className="form-error">
            Several messages in a short while: please try again in a few minutes.
          </p>
        )}

        <div className="contact-send">
          <button type="submit" className="button" disabled={!vm.canSend} aria-describedby={vm.canSend || vm.sending ? undefined : `${id}-send-hint`}>
            {vm.sending ? 'Sending…' : 'Send message'}
          </button>
          {!vm.canSend && !vm.sending && (
            <p className="field-hint" id={`${id}-send-hint`}>
              Fill in every field to send it.
            </p>
          )}
        </div>
      </form>
    </section>
  )
}

function FieldError({ id, error }: { id: string; error: string | undefined }) {
  if (!error) return null
  return (
    <p className="field-error" id={id}>
      {error}
    </p>
  )
}
