import { HackathonsSection } from '../../features/about/HackathonsSection/HackathonsSection'
import { LanguagesSection } from '../../features/about/LanguagesSection'
import { LicencesSection } from '../../features/about/LicencesSection/LicencesSection'
import { PapersSection } from '../../features/about/PapersSection'
import { PlacesSection } from '../../features/about/places/PlacesSection/PlacesSection'
import { ProblemSolvingSection } from '../../features/about/ProblemSolvingSection/ProblemSolvingSection'
import { ProfileSection } from '../../features/about/ProfileSection'
import { QualificationsSection } from '../../features/about/QualificationsSection'
import { SkillsSection } from '../../features/about/SkillsSection/SkillsSection'
import { EducationSection, ExperienceSection } from '../../features/about/TimelineSection'
import { ErrorState } from '../../components/ErrorState/ErrorState'
import { Loading, Skeleton, SkeletonCard, SkeletonChips } from '../../components/Skeleton'
import { ResumePanel } from '../../features/resume/ResumePanel/ResumePanel'
import { useAboutPageViewModel } from './AboutPage.viewModel'

/**
 * About Me: photo and links, where I've been, problem solving (LeetCode, NeetCode), skills, work experience, education, papers,
 * qualifications, languages, licences, hackathons. The admin can edit every section.
 */
export function AboutPage() {
  const vm = useAboutPageViewModel()
  const { state, canEdit, save } = vm

  const heading = <h2 className="visually-hidden">About Me</h2>
  if (state.status === 'loading')
    return (
      <>
        {heading}
        <AboutSkeleton />
      </>
    )
  if (state.status === 'error')
    return (
      <>
        {heading}
        <ErrorState message="This page couldn't be loaded." onRetry={vm.retry} />
      </>
    )

  const page = state.data
  return (
    <div className="about">
      {heading}
      {canEdit && <ResumePanel skills={vm.skillNames(page)} />}
      <ProfileSection
        value={vm.profile(page)}
        onRetryContact={vm.retryContact}
        leetCodeUsername={page.problemSolving.leetCodeUsername}
        canEdit={canEdit}
        onSave={vm.saveProfile}
      />
      <PlacesSection
        value={{ places: page.places, colors: page.colors.places }}
        canEdit={canEdit}
        onSave={({ places, colors }) => save({ places, colors: { ...page.colors, places: colors } })}
      />
      <ProblemSolvingSection value={page.problemSolving} canEdit={canEdit} onSave={(problemSolving) => save({ problemSolving })} />
      <SkillsSection
        value={{ skills: page.skills, colors: page.colors.skills }}
        canEdit={canEdit}
        onSave={({ skills, colors }) => save({ skills, colors: { ...page.colors, skills: colors } })}
      />
      <ExperienceSection value={page.experience} canEdit={canEdit} onSave={(experience) => save({ experience })} />
      <EducationSection value={page.education} canEdit={canEdit} onSave={(education) => save({ education })} />
      <PapersSection value={page.papers} canEdit={canEdit} onSave={(papers) => save({ papers })} />
      <QualificationsSection value={page.qualifications} canEdit={canEdit} onSave={(qualifications) => save({ qualifications })} />
      <LanguagesSection value={page.languages} canEdit={canEdit} onSave={(languages) => save({ languages })} />
      <LicencesSection value={page.licences} canEdit={canEdit} onSave={(licences) => save({ licences })} />
      <HackathonsSection value={page.hackathons} canEdit={canEdit} onSave={(hackathons) => save({ hackathons })} />
    </div>
  )
}

/** The page's shape while it loads: the profile card (photo, name, labels, links), then sections. */
function AboutSkeleton() {
  return (
    <Loading label="Loading About Me…" className="about">
      <div className="card">
        <div className="skeleton-profile">
          <Skeleton width={120} height={120} radius="50%" />
          <div className="skeleton-profile-text">
            <Skeleton width="45%" height={26} />
            <SkeletonChips count={2} />
            <SkeletonChips count={4} />
          </div>
        </div>
      </div>
      <SkeletonCard lines={6} />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={4} />
    </Loading>
  )
}
