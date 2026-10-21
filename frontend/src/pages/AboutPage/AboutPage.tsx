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
import { useAboutPageViewModel } from './AboutPage.viewModel'

/**
 * About Me: photo and links, where I've been, problem solving (LeetCode, NeetCode), skills, work experience, education, papers,
 * qualifications, languages, licences, hackathons. The admin can edit every section.
 */
export function AboutPage() {
  const vm = useAboutPageViewModel()
  const { sections, texts } = vm

  const heading = <h2 className="visually-hidden">{texts.heading}</h2>
  if (!sections)
    return (
      <>
        {heading}
        {vm.status === 'error' ? <ErrorState message={texts.error} onRetry={vm.retry} /> : <AboutSkeleton label={texts.loading} />}
      </>
    )

  return (
    <div className="about">
      {heading}
      {vm.canEdit && <ResumePanel skills={sections.resumeSkills} />}
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
