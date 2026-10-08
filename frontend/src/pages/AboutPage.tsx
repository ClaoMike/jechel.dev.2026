import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { BulletsSection } from '../features/about/BulletsSection'
import { ProfileSection } from '../features/about/ProfileSection'
import { SkillsSection } from '../features/about/SkillsSection'
import { EducationSection, ExperienceSection } from '../features/about/TimelineSection'
import { api, type AboutContent } from '../services/api'

type State = { status: 'loading' } | { status: 'loaded'; content: AboutContent } | { status: 'error' }

/** About Me: photo and links, skills, work experience, education, papers, qualifications. The admin can edit every section. */
export function AboutPage() {
  const { isAuthenticated } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    api.about
      .get(controller.signal)
      .then((content) => setState({ status: 'loaded', content }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      })
    return () => controller.abort()
  }, [])

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
      <ProfileSection value={{ photoUrl: page.photoUrl, links: page.links }} canEdit={isAuthenticated} onSave={(profile) => save(profile)} />
      <SkillsSection value={page.skills} canEdit={isAuthenticated} onSave={(skills) => save({ skills })} />
      <ExperienceSection value={page.experience} canEdit={isAuthenticated} onSave={(experience) => save({ experience })} />
      <EducationSection value={page.education} canEdit={isAuthenticated} onSave={(education) => save({ education })} />
      <BulletsSection title="Academic papers" errorKey="papers" itemName="paper" value={page.papers} canEdit={isAuthenticated} onSave={(papers) => save({ papers })} />
      <BulletsSection title="Qualifications" errorKey="qualifications" itemName="qualification" value={page.qualifications} canEdit={isAuthenticated} onSave={(qualifications) => save({ qualifications })} />
    </div>
  )
}
