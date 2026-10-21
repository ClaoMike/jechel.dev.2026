import type { UpdateEmailKind, UpdateEmailPreview, UpdateEmailsDocument, UpdateEmailWording } from '../../services/api'

/** The default wording, as the API sends it. */
export const DEFAULT_WORDING: UpdateEmailWording = {
  confirm: {
    subject: 'Confirm your jechel.dev updates',
    intro: "Hi,\n\nSomeone (hopefully you) asked to get an email from jechel.dev when there's a new app or video.",
    button: 'Yes, send me updates',
    note: "If it wasn't you, ignore this email: you won't hear from us again.",
  },
  video: { subject: 'A new video is up: {title}', heading: 'A new video is up', button: 'Watch it' },
  app: { subject: 'A new app is out: {title}', heading: 'A new app is out', button: 'Take a look' },
  footer: { reason: 'You get these because you subscribed on jechel.dev.', noReply: "Replies to this address aren't read. To get in touch, use the [contact page](/contact)." },
}

/** Until the admin saves their own. */
export const DEFAULT_EMAILS: UpdateEmailsDocument = { wording: DEFAULT_WORDING, defaults: DEFAULT_WORDING, updatedAt: null }

/** What the API would make of a wording: enough of it to see which email and words it shows. */
export function previewOf(kind: UpdateEmailKind, wording: UpdateEmailWording): UpdateEmailPreview {
  const subject = kind === 'confirm' ? wording.confirm.subject : wording[kind].subject.replace('{title}', kind === 'app' ? 'Space Game' : 'Devlog 1')
  const button = kind === 'confirm' ? wording.confirm.button : wording[kind].button
  return {
    from: 'jechel.dev <updates@jechel.dev>',
    subject,
    html: `<!doctype html><html><body><p>${kind}</p><a href="https://jechel.dev/">${button}</a><p>${wording.footer.noReply}</p></body></html>`,
    text: `${subject}\n\n${button}`,
  }
}
