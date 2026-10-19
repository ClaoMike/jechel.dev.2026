import { useAuth } from '../../auth'
import type { Profile } from '../../features/about/ProfileSection'
import { plainText } from '../../features/about/textLinks'
import { failureOf, type AboutContent, type ApiFailure, type ResumeContact } from '../../services/api'
import { useGetAboutQuery, useUpdateAboutMutation } from '../../store/api/aboutApi'
import { useGetResumeSettingsQuery, useSaveResumeContactMutation } from '../../store/api/resumeApi'
import { toLoadable } from '../../store/loadable'

/**
 * About Me from the store, and saving it: a section is saved by sending the whole page with that
 * section changed, and every view shows the page as the API stored it. For the admin, also the
 * résumé's private phone, email and headline (edited with the profile).
 */
export function useAboutPageViewModel() {
  const { isAuthenticated } = useAuth()
  const query = useGetAboutQuery()
  const state = toLoadable(query)
  const content = state.status === 'loaded' ? state.data : null
  const [updateAbout] = useUpdateAboutMutation()
  // The résumé's private details: only loaded for the admin. If they can't be, the profile says so, with a retry.
  const resume = useGetResumeSettingsQuery(undefined, { skip: !isAuthenticated })
  const contact: ResumeContact | undefined = resume.data && { phone: resume.data.phone, email: resume.data.email, headline: resume.data.headline }
  const [saveResumeContact] = useSaveResumeContactMutation()

  const save = async (patch: Partial<AboutContent>) => {
    if (content) await updateAbout({ ...content, ...patch }).unwrap()
  }

  /** Its field errors come back as "contact.phone", … so the profile editor shows them. */
  const saveContact = async (next: ResumeContact) => {
    try {
      await saveResumeContact(next).unwrap()
    } catch (error) {
      const { status, validationErrors } = failureOf(error)
      const prefixed = validationErrors && Object.fromEntries(Object.entries(validationErrors).map(([key, messages]) => [`contact.${key}`, messages]))
      throw { status, validationErrors: prefixed } satisfies ApiFailure
    }
  }

  return {
    state,
    retry: () => void query.refetch(),
    canEdit: isAuthenticated,
    save,
    /** The profile section's value: the page's photo, labels and links, and (admin only) the résumé's contact. */
    profile: (page: AboutContent): Profile => ({ photoUrl: page.photoUrl, statuses: page.statuses, links: page.links, contact: isAuthenticated ? contact : undefined }),
    retryContact: isAuthenticated && resume.isError ? () => void resume.refetch() : undefined,
    saveProfile: async ({ contact: nextContact, ...profile }: Profile) => {
      if (nextContact) await saveContact(nextContact)
      await save(profile)
    },
    skillNames: (page: AboutContent) => page.skills.map((skill) => plainText(skill.name)),
  }
}
