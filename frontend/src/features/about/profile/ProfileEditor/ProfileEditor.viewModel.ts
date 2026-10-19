import type { EditorProps } from '../../../../components/fields'
import type { AboutLinks, ResumeContact, Status } from '../../../../services/api'
import { isSafeUrl } from '../../format'
import { PHOTO_MAX_BYTES } from '../../uploadLimits'
import type { Profile } from '../profile'

/** Changing the photo, the labels, the links and (admin) the résumé's contact in the profile's draft. */
export function useProfileEditorViewModel({ value, onChange, update }: EditorProps<Profile>) {
  return {
    photo: {
      url: isSafeUrl(value.photoUrl) ? value.photoUrl : null,
      maxBytes: PHOTO_MAX_BYTES,
      uploaded: (url: string) => update((current) => ({ ...current, photoUrl: url })),
      remove: value.photoUrl ? () => onChange({ ...value, photoUrl: '' }) : undefined,
    },
    contact: value.contact ?? null,
    setContact: (key: keyof ResumeContact) => (text: string) => onChange({ ...value, contact: { ...value.contact!, [key]: text } }),
    setLink: (key: keyof AboutLinks) => (url: string) => onChange({ ...value, links: { ...value.links, [key]: url } }),
    setStatuses: (statuses: Status[]) => onChange({ ...value, statuses }),
  }
}
