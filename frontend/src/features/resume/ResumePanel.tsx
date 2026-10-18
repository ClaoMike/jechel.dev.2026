import { useEffect, useState } from 'react'
import { DownloadIcon, PhoneIcon } from '../../components/icons'
import { api, RESUME_SECTIONS, type ResumeChoices, type ResumeSection, type ResumeSettingsDetails } from '../../services/api'
import { formatDateTime } from '../../utils/formatDate'
import { CheckboxGroup } from '../about/fields'

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

type State = { status: 'loading' } | { status: 'error' } | { status: 'loaded'; saved: ResumeSettingsDetails }
type Busy = 'saving' | 'generating' | null

/**
 * The admin's résumé generator on About Me: which sections and skills go in. The header (headline,
 * email, phone) is edited with "Photo and links" below. Generating makes two PDFs: visitors'
 * "Download résumé" gets the public one; the private one, with the phone number, is only for the admin.
 */
export function ResumePanel({ skills, onGenerated }: { skills: string[]; onGenerated: () => void }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [draft, setDraft] = useState<ResumeChoices | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    api.resume
      .getSettings(controller.signal)
      .then((saved) => {
        setState({ status: 'loaded', saved })
        setDraft({ sections: saved.sections, excludedSkills: saved.excludedSkills })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      })
    return () => controller.abort()
  }, [])

  async function run(kind: Exclude<Busy, null>) {
    if (!draft) return
    setBusy(kind)
    setMessage('')
    try {
      const saved = kind === 'generating' ? await api.resume.generate(draft) : await api.resume.saveChoices(draft)
      setState({ status: 'loaded', saved })
      setDraft({ sections: saved.sections, excludedSkills: saved.excludedSkills })
      setMessage(kind === 'generating' ? 'Both résumés are ready. Visitors now download the public copy.' : 'Saved.')
      if (kind === 'generating') onGenerated()
    } catch {
      setMessage(kind === 'generating' ? "The résumés couldn't be generated. Please try again." : "That couldn't be saved. Please try again.")
    } finally {
      setBusy(null)
    }
  }

  const generatedAt = state.status === 'loaded' ? state.saved.generatedAt : null
  const version = generatedAt ? `?v=${Date.parse(generatedAt)}` : ''

  return (
    <details className="card resume-panel">
      <summary>
        <span className="resume-panel-title">Résumé generator</span>
        <span className="muted"> · only you see this</span>
      </summary>

      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">The résumé settings couldn't be loaded.</p>}
      {draft && (
        <form
          className="editor-list"
          onSubmit={(e) => {
            e.preventDefault()
            void run('generating')
          }}
        >
          <p className="muted editor-note">
            Made from this page as it is now. The headline, email and phone at the top are edited with Photo and links below; the phone is only in your private copy.
          </p>
          <CheckboxGroup
            label="Sections to include"
            options={RESUME_SECTIONS}
            value={draft.sections}
            onChange={(sections) => setDraft({ ...draft, sections })}
            labelFor={(section) => SECTION_LABELS[section]}
          />
          {draft.sections.includes('skills') && skills.length > 0 && (
            <CheckboxGroup
              label="Skills to show"
              options={skills}
              value={skills.filter((skill) => !draft.excludedSkills.some((excluded) => sameSkill(excluded, skill)))}
              onChange={(shown) => setDraft({ ...draft, excludedSkills: skills.filter((skill) => !shown.includes(skill)) })}
              labelFor={(skill) => skill}
            />
          )}

          <div className="resume-actions">
            <button type="submit" className="button" disabled={busy !== null}>
              {busy === 'generating' ? 'Generating…' : 'Generate résumés'}
            </button>
            <button type="button" className="button button-secondary" disabled={busy !== null} onClick={() => void run('saving')}>
              {busy === 'saving' ? 'Saving…' : 'Save without generating'}
            </button>
          </div>
          {message && <p role="status">{message}</p>}

          {generatedAt ? (
            <div className="resume-downloads">
              <p className="muted">Last generated {formatDateTime(generatedAt)}.</p>
              <div className="resume-actions">
                <a className="button button-secondary" href={`${api.resume.privateUrl}${version}`} download>
                  <PhoneIcon />
                  Download private copy
                </a>
                <a className="button button-secondary" href={`${api.resume.publicUrl}${version}`} download>
                  <DownloadIcon />
                  Download public copy
                </a>
              </div>
            </div>
          ) : (
            <p className="muted">Not generated yet.</p>
          )}
        </form>
      )}
    </details>
  )
}

/** Skill names match whatever their case, like on the API. */
function sameSkill(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase()
}
