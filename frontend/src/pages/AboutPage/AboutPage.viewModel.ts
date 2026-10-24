import { useAuth } from '../../auth'
import type { Profile } from '../../features/about/profile/profile'
import { plainText } from '../../features/about/textLinks'
import { failureOf, type AboutContent, type ApiFailure, type ResumeContact } from '../../services/api'
import { useGetAboutQuery, useUpdateAboutMutation } from '../../store/api/aboutApi'
import { useGetYouTubeChannelQuery } from '../../store/api/appsApi'
import { useGetResumeHeadlineQuery, useGetResumeSettingsQuery, useSaveResumeContactMutation } from '../../store/api/resumeApi'
import { toLoadable } from '../../store/loadable'

const TEXTS = { heading: 'About Me', loading: 'Loading About Me…', error: "This page couldn't be loaded." }

/**
 * About Me from the store, and saving it: a section is saved by sending the whole page with that
 * section changed, and every view shows the page as the API stored it. For the admin, also the
 * résumé's private phone, email and headline (edited with the profile). Each section gets its value
 * and its save from here.
 */
export function useAboutPageViewModel() {
  const { isAuthenticated } = useAuth()
  const query = useGetAboutQuery()
  const state = toLoadable(query)
  const page = state.status === 'loaded' ? state.data : null
  const [updateAbout] = useUpdateAboutMutation()
  // The résumé's private details: only loaded for the admin. If they can't be, the profile says so, with a retry.
  const resume = useGetResumeSettingsQuery(undefined, { skip: !isAuthenticated })
  const contact: ResumeContact | undefined = resume.data && { phone: resume.data.phone, email: resume.data.email, headline: resume.data.headline }
  const [saveResumeContact] = useSaveResumeContactMutation()
  // Public, under the name; the admin's save updates it at once. Without it, the name stands alone.
  const headline = useGetResumeHeadlineQuery().data ?? ''
  // My channel (Settings → YouTube), with the profile's links.
  const youTubeChannelUrl = useGetYouTubeChannelQuery().data?.url

  const save = async (patch: Partial<AboutContent>) => {
    if (page) await updateAbout({ ...page, ...patch }).unwrap()
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

  const canEdit = isAuthenticated
  const section = <K extends keyof AboutContent>(key: K) => ({ value: page![key], canEdit, onSave: (value: AboutContent[K]) => save({ [key]: value } as Partial<AboutContent>) })

  return {
    texts: TEXTS,
    status: state.status,
    retry: () => void query.refetch(),
    canEdit,
    /** Null until the page is loaded. */
    sections: page && {
      resumeSkills: page.skills.map((skill) => plainText(skill.name)),
      profile: {
        value: { photoUrl: page.photoUrl, statuses: page.statuses, links: page.links, contact: isAuthenticated ? contact : undefined } satisfies Profile,
        headline,
        leetCodeUsername: page.problemSolving.leetCodeUsername,
        youTubeChannelUrl,
        canEdit,
        onRetryContact: isAuthenticated && resume.isError ? () => void resume.refetch() : undefined,
        onSave: async ({ contact: nextContact, ...profile }: Profile) => {
          if (nextContact) await saveContact(nextContact)
          await save(profile)
        },
      },
      places: {
        value: { places: page.places, colors: page.colors.places },
        canEdit,
        onSave: ({ places, colors }: { places: AboutContent['places']; colors: AboutContent['colors']['places'] }) => save({ places, colors: { ...page.colors, places: colors } }),
      },
      problemSolving: section('problemSolving'),
      skills: {
        value: { skills: page.skills, colors: page.colors.skills },
        canEdit,
        onSave: ({ skills, colors }: { skills: AboutContent['skills']; colors: AboutContent['colors']['skills'] }) => save({ skills, colors: { ...page.colors, skills: colors } }),
      },
      experience: section('experience'),
      education: section('education'),
      papers: section('papers'),
      qualifications: section('qualifications'),
      languages: section('languages'),
      licences: section('licences'),
      hackathons: section('hackathons'),
    },
  }
}
