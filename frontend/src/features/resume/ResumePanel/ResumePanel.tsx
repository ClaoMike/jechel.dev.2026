import { useState } from 'react'
import { CheckboxGroup } from '../../../components/fields'
import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { ResumeDownloads } from '../ResumeDownloads/ResumeDownloads'
import { ResumeSkeleton } from '../ResumeSkeleton/ResumeSkeleton'
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
 * The admin's résumé generator on About Me: which sections and skills go in. The header (headline,
 * email, phone) is edited with "Photo and links" below. Generating makes two PDFs: visitors'
 * "Download résumé" gets the public one; the private one, with the email and phone number, is only for the admin.
 */
export function ResumePanel({ skills }: { skills: string[] }) {
  // The saved choices from the store, a draft of them, and saving or generating. Generating loads About Me again (its
  // "Download résumé" link changed).
  const query = useGetResumeSettingsQuery()
  const state = toLoadable(query)
  const saved = state.status === 'loaded' ? state.data : null
  // Null: what's saved, until it's changed here.
  const [changed, setChanged] = useState<ResumeChoices | null>(null)
  const draft = changed ?? (saved && { sections: saved.sections, excludedSkills: saved.excludedSkills })
  const [busy, setBusy] = useState<Busy>(null)
  const [message, setMessage] = useState('')
  const [saveChoices] = useSaveResumeChoicesMutation()
  const [generateResume] = useGenerateResumeMutation()

  async function run(kind: Exclude<Busy, null>) {
    if (!draft) return
    setBusy(kind)
    setMessage('')
    try {
      await (kind === 'generating' ? generateResume(draft) : saveChoices(draft)).unwrap()
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
  const status = state.status
  const retry = () => void query.refetch()
  const errorMessage = "The résumé settings couldn't be loaded."
  const sectionLabel = (section: ResumeSection) => SECTION_LABELS[section]
  const setSections = (sections: ResumeSection[]) => draft && setChanged({ ...draft, sections })
  const showSkills = !!draft && draft.sections.includes('skills') && skills.length > 0
  const shownSkills = draft ? skills.filter((skill) => !draft.excludedSkills.some((excluded) => sameSkill(excluded, skill))) : []
  const setShownSkills = (shown: string[]) => draft && setChanged({ ...draft, excludedSkills: skills.filter((skill) => !shown.includes(skill)) })
  const generateLabel = busy === 'generating' ? 'Generating…' : 'Generate résumés'
  const saveLabel = busy === 'saving' ? 'Saving…' : 'Save without generating'
  const save = () => void run('saving')
  const generated = generatedAt ? `Last generated ${formatDateTime(generatedAt)}.` : null
  const skillLabel = (skill: string) => skill
  const privateUrl = `${api.resume.privateUrl}${version}`
  const publicUrl = `${api.resume.publicUrl}${version}`

  return (
    <details className="card resume-panel">
      <summary>
        <span className="resume-panel-title">Résumé generator</span>
        <span className="muted"> · only you see this</span>
      </summary>

      {status === 'loading' && <ResumeSkeleton />}
      {status === 'error' && <ErrorState message={errorMessage} onRetry={retry} />}
      {draft && (
        <form
          className="editor-list"
          onSubmit={(e) => {
            e.preventDefault()
            void run('generating')
          }}
        >
          <CheckboxGroup label="Sections to include" options={RESUME_SECTIONS} value={draft.sections} onChange={setSections} labelFor={sectionLabel} />
          {showSkills && <CheckboxGroup label="Skills to show" options={skills} value={shownSkills} onChange={setShownSkills} labelFor={skillLabel} />}

          <div className="resume-actions">
            <button type="submit" className="button" disabled={busy !== null}>
              {generateLabel}
            </button>
            <button type="button" className="button button-secondary" disabled={busy !== null} onClick={save}>
              {saveLabel}
            </button>
          </div>
          {message && <p role="status">{message}</p>}
          <ResumeDownloads generated={generated} privateUrl={privateUrl} publicUrl={publicUrl} />
        </form>
      )}
    </details>
  )
}
