import { useEffect, useState } from 'react'
import { DownloadIcon, ExternalLinkIcon, PhoneIcon } from '../../components/icons'
import { api, ApiError, RESUME_SECTIONS, type ResumeSection, type ResumeSettings, type ResumeSettingsDetails } from '../../services/api'
import { formatDateTime } from '../../utils/formatDate'
import { CheckboxGroup, TextField, type FieldErrors } from '../about/fields'

const SECTION_LABELS: Record<ResumeSection, string> = {
  summary: 'Profile (the summary below)',
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
 * The admin's résumé generator on About Me. The résumé is made from the page; this adds what isn't
 * on it (phone, email, headline, location, a summary) and which sections to include. Generating
 * makes two PDFs: visitors' "Download résumé" gets the one without the phone number; the one with it
 * is only for the admin. Nothing here is ever shown to visitors.
 */
export function ResumePanel({ skills, onGenerated }: { skills: string[]; onGenerated: () => void }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [draft, setDraft] = useState<ResumeSettings | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState<Busy>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    api.resume
      .getSettings(controller.signal)
      .then((saved) => {
        setState({ status: 'loaded', saved })
        setDraft(toSettings(saved))
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
    setErrors({})
    try {
      const saved = kind === 'generating' ? await api.resume.generate(draft) : await api.resume.saveSettings(draft)
      setState({ status: 'loaded', saved })
      setDraft(toSettings(saved))
      setMessage(kind === 'generating' ? 'Both résumés are ready. Visitors now download the one without your phone number.' : 'Saved.')
      if (kind === 'generating') onGenerated()
    } catch (error) {
      if (error instanceof ApiError && error.validationErrors) {
        setErrors(Object.fromEntries(Object.entries(error.validationErrors).map(([key, messages]) => [key, messages[0]])))
        setMessage('Fix the fields marked below.')
      } else {
        setMessage(kind === 'generating' ? "The résumés couldn't be generated. Please try again." : "That couldn't be saved. Please try again.")
      }
    } finally {
      setBusy(null)
    }
  }

  const set = <K extends keyof ResumeSettings>(key: K) => (value: ResumeSettings[K]) => setDraft((current) => (current ? { ...current, [key]: value } : current))
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
            Made from this page as it is now. Fill in what isn't on the page, choose the sections, then generate. Your phone number is never shown on the site: it's only in your own copy.
          </p>
          <div className="editor-grid">
            <TextField label="Phone (private)" type="tel" value={draft.phone} onChange={set('phone')} error={errors.phone} hint="Only in the copy you download for applications." />
            <TextField label="Email" type="email" value={draft.email} onChange={set('email')} error={errors.email} hint="In both copies. Leave empty to leave it out." />
            <TextField label="Headline" value={draft.headline} onChange={set('headline')} error={errors.headline} placeholder="Full-stack engineer · .NET, React, PostgreSQL" />
            <TextField label="Location" value={draft.location} onChange={set('location')} error={errors.location} placeholder="Manchester, UK" />
          </div>
          <TextField label="Summary" multiline allowLinks value={draft.summary} onChange={set('summary')} error={errors.summary} hint="Two or three sentences at the top: who you are and what you're after." />
          <CheckboxGroup
            label="Sections to include"
            options={RESUME_SECTIONS}
            value={draft.sections}
            onChange={set('sections')}
            labelFor={(section) => SECTION_LABELS[section]}
            error={errors.sections}
          />
          {draft.sections.includes('skills') && skills.length > 0 && (
            <CheckboxGroup
              label="Skills to show"
              options={skills}
              value={skills.filter((skill) => !draft.excludedSkills.some((excluded) => sameSkill(excluded, skill)))}
              onChange={(shown) => set('excludedSkills')(skills.filter((skill) => !shown.includes(skill)))}
              labelFor={(skill) => skill}
              error={errors.excludedSkills}
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
                  Download with phone
                </a>
                <a className="button button-secondary" href={`${api.resume.publicUrl}${version}`} download>
                  <DownloadIcon />
                  Download public copy
                </a>
                <a className="button button-secondary" href={`${api.resume.publicUrl}${version ? `${version}&` : '?'}inline=true`} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon />
                  Preview
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

function toSettings({ phone, email, headline, location, summary, sections, excludedSkills }: ResumeSettingsDetails): ResumeSettings {
  return { phone, email, headline, location, summary, sections, excludedSkills }
}

/** Skill names match whatever their case, like on the API. */
function sameSkill(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase()
}
