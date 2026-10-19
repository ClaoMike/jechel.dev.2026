import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { Loading, Skeleton, SkeletonChips } from '../../../components/Skeleton'
import { DownloadIcon, PhoneIcon } from '../../../components/icons/icons'
import { formatDateTime } from '../../../utils/formatDate'
import { CheckboxGroup } from '../../about/fields/fields'
import { useResumePanelViewModel } from './ResumePanel.viewModel'

/**
 * The admin's résumé generator on About Me: which sections and skills go in. The header (headline,
 * email, phone) is edited with "Photo and links" below. Generating makes two PDFs: visitors'
 * "Download résumé" gets the public one; the private one, with the phone number, is only for the admin.
 */
export function ResumePanel({ skills }: { skills: string[] }) {
  const vm = useResumePanelViewModel(skills)
  const { draft, generatedAt } = vm

  return (
    <details className="card resume-panel">
      <summary>
        <span className="resume-panel-title">Résumé generator</span>
        <span className="muted"> · only you see this</span>
      </summary>

      {vm.status === 'loading' && (
        <Loading label="Loading the résumé settings…">
          <Skeleton width="30%" height={14} />
          <SkeletonChips count={8} />
          <Skeleton width={160} height={40} radius={999} />
        </Loading>
      )}
      {vm.status === 'error' && <ErrorState message="The résumé settings couldn't be loaded." onRetry={vm.retry} />}
      {draft && (
        <form
          className="editor-list"
          onSubmit={(e) => {
            e.preventDefault()
            vm.generate()
          }}
        >
          <p className="muted editor-note">
            Made from this page as it is now. The headline, email and phone at the top are edited with Photo and links below; the phone is only in your private copy.
          </p>
          <CheckboxGroup
            label="Sections to include"
            options={vm.sectionOptions}
            value={draft.sections}
            onChange={vm.setSections}
            labelFor={vm.sectionLabel}
          />
          {vm.showSkills && (
            <CheckboxGroup
              label="Skills to show"
              options={skills}
              value={vm.shownSkills}
              onChange={vm.setShownSkills}
              labelFor={(skill) => skill}
            />
          )}

          <div className="resume-actions">
            <button type="submit" className="button" disabled={vm.busy !== null}>
              {vm.busy === 'generating' ? 'Generating…' : 'Generate résumés'}
            </button>
            <button type="button" className="button button-secondary" disabled={vm.busy !== null} onClick={vm.save}>
              {vm.busy === 'saving' ? 'Saving…' : 'Save without generating'}
            </button>
          </div>
          {vm.message && <p role="status">{vm.message}</p>}

          {generatedAt ? (
            <div className="resume-downloads">
              <p className="muted">Last generated {formatDateTime(generatedAt)}.</p>
              <div className="resume-actions">
                <a className="button button-secondary" href={vm.privateUrl} download>
                  <PhoneIcon />
                  Download private copy
                </a>
                <a className="button button-secondary" href={vm.publicUrl} download>
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
