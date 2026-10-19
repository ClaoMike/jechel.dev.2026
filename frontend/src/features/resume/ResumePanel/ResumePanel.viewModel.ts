import { useState } from 'react'
import { api, RESUME_SECTIONS, type ResumeChoices, type ResumeSection } from '../../../services/api'
import { useGenerateResumeMutation, useGetResumeSettingsQuery, useSaveResumeChoicesMutation } from '../../../store/api/resumeApi'
import { toLoadable } from '../../../store/loadable'
import { formatDateTime } from '../../../utils/formatDate'

const SECTION_LABELS: Record<ResumeSection, string> = {
  statuses: 'Citizenship and residence',
  links: 'Links (this site, GitHub, LinkedIn)',
  experience: 'Work experience',
  skills: 'Skills',
  education: 'Education',
  qualifications: 'Qualifications',
  papers: 'Academic papers',
  hackathons: 'Hackathons',
  problemSolving: 'Problem solving (LeetCode, NeetCode)',
  languages: 'Languages',
  licences: 'Licences',
  places: "Where I've been (as a list)",
}

/** Skill names match whatever their case, like on the API. */
function sameSkill(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase()
}

type Busy = 'saving' | 'generating' | null

/**
 * The saved choices from the store, a draft of them, and saving or generating. Generating loads About
 * Me again (its "Download résumé" link changed).
 */
export function useResumePanelViewModel(skills: string[]) {
  const query = useGetResumeSettingsQuery()
  const state = toLoadable(query)
  const saved = state.status === 'loaded' ? state.data : null
  // Null: what's saved, until it's changed here.
  const [changed, setChanged] = useState<ResumeChoices | null>(null)
  const draft = changed ?? (saved && { sections: saved.sections, excludedSkills: saved.excludedSkills })
  const [busy, setBusy] = useState<Busy>(null)
  const [message, setMessage] = useState('')
  const [saveChoices] = useSaveResumeChoicesMutation()
  const [generate] = useGenerateResumeMutation()

  async function run(kind: Exclude<Busy, null>) {
    if (!draft) return
    setBusy(kind)
    setMessage('')
    try {
      await (kind === 'generating' ? generate(draft) : saveChoices(draft)).unwrap()
      setChanged(null)
      setMessage(kind === 'generating' ? 'Both résumés are ready. Visitors now download the public copy.' : 'Saved.')
    } catch {
      setMessage(kind === 'generating' ? "The résumés couldn't be generated. Please try again." : "That couldn't be saved. Please try again.")
    } finally {
      setBusy(null)
    }
  }

  const generatedAt = saved?.generatedAt ?? null
  const version = generatedAt ? `?v=${Date.parse(generatedAt)}` : ''

  return {
    status: state.status,
    retry: () => void query.refetch(),
    draft,
    errorMessage: "The résumé settings couldn't be loaded.",
    sectionOptions: RESUME_SECTIONS,
    sectionLabel: (section: ResumeSection) => SECTION_LABELS[section],
    setSections: (sections: ResumeSection[]) => draft && setChanged({ ...draft, sections }),
    showSkills: !!draft && draft.sections.includes('skills') && skills.length > 0,
    shownSkills: draft ? skills.filter((skill) => !draft.excludedSkills.some((excluded) => sameSkill(excluded, skill))) : [],
    setShownSkills: (shown: string[]) => draft && setChanged({ ...draft, excludedSkills: skills.filter((skill) => !shown.includes(skill)) }),
    busy,
    generateLabel: busy === 'generating' ? 'Generating…' : 'Generate résumés',
    saveLabel: busy === 'saving' ? 'Saving…' : 'Save without generating',
    message,
    generate: () => void run('generating'),
    save: () => void run('saving'),
    generated: generatedAt ? `Last generated ${formatDateTime(generatedAt)}.` : null,
    skillLabel: (skill: string) => skill,
    privateUrl: `${api.resume.privateUrl}${version}`,
    publicUrl: `${api.resume.publicUrl}${version}`,
  }
}
