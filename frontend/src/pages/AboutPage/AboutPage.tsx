import { ErrorState } from '../../components/ErrorState/ErrorState'
import { AboutSkeleton } from '../../features/about/AboutSkeleton/AboutSkeleton'
import { HackathonsSection } from '../../features/about/hackathons/HackathonsSection/HackathonsSection'
import { LanguagesSection } from '../../features/about/languages/LanguagesSection/LanguagesSection'
import { LicencesSection } from '../../features/about/licences/LicencesSection/LicencesSection'
import { PapersSection } from '../../features/about/papers/PapersSection/PapersSection'
import { PlacesSection } from '../../features/about/places/PlacesSection/PlacesSection'
import { ProblemSolvingSection } from '../../features/about/problemSolving/ProblemSolvingSection/ProblemSolvingSection'
import { ProfileSection } from '../../features/about/profile/ProfileSection/ProfileSection'
import { QualificationsSection } from '../../features/about/qualifications/QualificationsSection/QualificationsSection'
import { SkillsSection } from '../../features/about/skills/SkillsSection/SkillsSection'
import { EducationSection } from '../../features/about/timeline/EducationSection/EducationSection'
import { ExperienceSection } from '../../features/about/timeline/ExperienceSection/ExperienceSection'
import { ResumePanel } from '../../features/resume/ResumePanel/ResumePanel'
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
 * About Me: photo and links, where I've been, problem solving (LeetCode, NeetCode), skills, work experience, education, papers,
 * qualifications, languages, licences, hackathons. The admin can edit every section.
 */
export function AboutPage() {
  // About Me from the store, and saving it: a section is saved by sending the whole page with that section changed, and
  // every view shows the page as the API stored it. For the admin, also the résumé's private phone, email and headline
  // (edited with the profile). Each section gets its value and its save from here.
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

  const section = <K extends keyof AboutContent>(key: K) => ({
    value: page![key],
    canEdit: isAuthenticated,
    onSave: (value: AboutContent[K]) => save({ [key]: value } as Partial<AboutContent>),
  })
  const status = state.status
  const retry = () => void query.refetch()
  /** Null until the page is loaded. */
  const sections = page && {
    resumeSkills: page.skills.map((skill) => plainText(skill.name)),
    profile: {
      value: { photoUrl: page.photoUrl, statuses: page.statuses, links: page.links, contact: isAuthenticated ? contact : undefined } satisfies Profile,
      headline,
      leetCodeUsername: page.problemSolving.leetCodeUsername,
      youTubeChannelUrl,
      canEdit: isAuthenticated,
      onRetryContact: isAuthenticated && resume.isError ? () => void resume.refetch() : undefined,
      onSave: async ({ contact: nextContact, ...profile }: Profile) => {
        if (nextContact) await saveContact(nextContact)
        await save(profile)
      },
    },
    places: {
      value: { places: page.places, colors: page.colors.places },
      canEdit: isAuthenticated,
      onSave: ({ places, colors }: { places: AboutContent['places']; colors: AboutContent['colors']['places'] }) => save({ places, colors: { ...page.colors, places: colors } }),
    },
    problemSolving: section('problemSolving'),
    skills: {
      value: { skills: page.skills, colors: page.colors.skills },
      canEdit: isAuthenticated,
      onSave: ({ skills, colors }: { skills: AboutContent['skills']; colors: AboutContent['colors']['skills'] }) => save({ skills, colors: { ...page.colors, skills: colors } }),
    },
    experience: section('experience'),
    education: section('education'),
    papers: section('papers'),
    qualifications: section('qualifications'),
    languages: section('languages'),
    licences: section('licences'),
    hackathons: section('hackathons'),
  }

  const heading = <h2 className="visually-hidden">{TEXTS.heading}</h2>
  if (!sections)
    return (
      <>
        {heading}
        {status === 'error' ? <ErrorState message={TEXTS.error} onRetry={retry} /> : <AboutSkeleton label={TEXTS.loading} />}
      </>
    )

  return (
    <div className="about">
      {heading}
      {isAuthenticated && <ResumePanel skills={sections.resumeSkills} />}
      <ProfileSection {...sections.profile} />
      <PlacesSection {...sections.places} />
      <ProblemSolvingSection {...sections.problemSolving} />
      <SkillsSection {...sections.skills} />
      <ExperienceSection {...sections.experience} />
      <EducationSection {...sections.education} />
      <PapersSection {...sections.papers} />
      <QualificationsSection {...sections.qualifications} />
      <LanguagesSection {...sections.languages} />
      <LicencesSection {...sections.licences} />
      <HackathonsSection {...sections.hackathons} />
    </div>
  )
}
