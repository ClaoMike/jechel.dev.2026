import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { HackathonsSection } from '../features/about/HackathonsSection'
import { LanguagesSection } from '../features/about/LanguagesSection'
import { LicencesSection } from '../features/about/LicencesSection'
import { PapersSection } from '../features/about/PapersSection'
import { PlacesSection } from '../features/about/places/PlacesSection'
import { ProblemSolvingSection } from '../features/about/ProblemSolvingSection'
import { ProfileSection } from '../features/about/ProfileSection'
import { QualificationsSection } from '../features/about/QualificationsSection'
import { SkillsSection } from '../features/about/SkillsSection'
import { EducationSection, ExperienceSection } from '../features/about/TimelineSection'
import { ResumePanel } from '../features/resume/ResumePanel'
import { plainText } from '../features/about/textLinks'
import { api, ApiError, type AboutContent, type ResumeContact } from '../services/api'

/** Saves the résumé's contact details; its field errors come back as "contact.phone", … so the profile editor shows them. */
async function saveContact(contact: ResumeContact): Promise<ResumeContact> {
  try {
    const { phone, email, headline } = await api.resume.saveContact(contact)
    return { phone, email, headline }
  } catch (error) {
    if (error instanceof ApiError && error.validationErrors) {
      throw new ApiError('/api/resume/contact', error.status, Object.fromEntries(Object.entries(error.validationErrors).map(([key, messages]) => [`contact.${key}`, messages])))
    }
    throw error
  }
}

type State = { status: 'loading' } | { status: 'loaded'; content: AboutContent } | { status: 'error' }

/**
 * About Me: photo and links, where I've been, problem solving (LeetCode, NeetCode), skills, work experience, education, papers,
 * qualifications, languages, licences, hackathons. The admin can edit every section.
 */
export function AboutPage() {
  const { isAuthenticated } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })
  // Bumped after generating a résumé: the page's download link changed.
  const [reloads, setReloads] = useState(0)
  const reload = useCallback(() => setReloads((n) => n + 1), [])
  // The résumé's private phone, email and headline: only loaded for the admin.
  const [contact, setContact] = useState<ResumeContact | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    const controller = new AbortController()
    api.resume
      .getSettings(controller.signal)
      .then(({ phone, email, headline }) => setContact({ phone, email, headline }))
      .catch(() => {
        // The profile then just doesn't offer them.
      })
    return () => controller.abort()
  }, [isAuthenticated])

  useEffect(() => {
    const controller = new AbortController()
    api.about
      .get(controller.signal)
      .then((content) => setState({ status: 'loaded', content }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      })
    return () => controller.abort()
  }, [reloads])

  const content = state.status === 'loaded' ? state.content : null

  // Saves one section by sending the whole page with that section changed; shows the page as the API stored it.
  const save = useCallback(
    async (patch: Partial<AboutContent>) => {
      if (!content) return
      const saved = await api.about.update({ ...content, ...patch })
      setState({ status: 'loaded', content: saved })
    },
    [content],
  )

  const heading = <h2 className="visually-hidden">About Me</h2>
  if (state.status === 'loading')
    return (
      <>
        {heading}
        <p>Loading…</p>
      </>
    )
  if (state.status === 'error')
    return (
      <>
        {heading}
        <p role="alert">This page couldn't be loaded. Please try again later.</p>
      </>
    )

  const { content: page } = state
  return (
    <div className="about">
      {heading}
      {isAuthenticated && <ResumePanel skills={page.skills.map((skill) => plainText(skill.name))} onGenerated={reload} />}
      <ProfileSection
        value={{ photoUrl: page.photoUrl, statuses: page.statuses, links: page.links, contact: isAuthenticated && contact ? contact : undefined }}
        leetCodeUsername={page.problemSolving.leetCodeUsername}
        canEdit={isAuthenticated}
        onSave={async ({ contact: nextContact, ...profile }) => {
          if (nextContact) setContact(await saveContact(nextContact))
          await save(profile)
        }}
      />
      <PlacesSection
        value={{ places: page.places, colors: page.colors.places }}
        canEdit={isAuthenticated}
        onSave={({ places, colors }) => save({ places, colors: { ...page.colors, places: colors } })}
      />
      <ProblemSolvingSection value={page.problemSolving} canEdit={isAuthenticated} onSave={(problemSolving) => save({ problemSolving })} />
      <SkillsSection
        value={{ skills: page.skills, colors: page.colors.skills }}
        canEdit={isAuthenticated}
        onSave={({ skills, colors }) => save({ skills, colors: { ...page.colors, skills: colors } })}
      />
      <ExperienceSection value={page.experience} canEdit={isAuthenticated} onSave={(experience) => save({ experience })} />
      <EducationSection value={page.education} canEdit={isAuthenticated} onSave={(education) => save({ education })} />
      <PapersSection value={page.papers} canEdit={isAuthenticated} onSave={(papers) => save({ papers })} />
      <QualificationsSection value={page.qualifications} canEdit={isAuthenticated} onSave={(qualifications) => save({ qualifications })} />
      <LanguagesSection value={page.languages} canEdit={isAuthenticated} onSave={(languages) => save({ languages })} />
      <LicencesSection value={page.licences} canEdit={isAuthenticated} onSave={(licences) => save({ licences })} />
      <HackathonsSection value={page.hackathons} canEdit={isAuthenticated} onSave={(hackathons) => save({ hackathons })} />
    </div>
  )
}
