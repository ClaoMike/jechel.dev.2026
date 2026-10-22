import { CheckboxGroup } from '../../../components/fields'
import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { ResumeDownloads } from '../ResumeDownloads/ResumeDownloads'
import { ResumeSkeleton } from '../ResumeSkeleton/ResumeSkeleton'
import { useResumePanelViewModel } from './ResumePanel.viewModel'

/**
 * The admin's résumé generator on About Me: which sections and skills go in. The header (headline,
 * email, phone) is edited with "Photo and links" below. Generating makes two PDFs: visitors'
 * "Download résumé" gets the public one; the private one, with the email and phone number, is only for the admin.
 */
export function ResumePanel({ skills }: { skills: string[] }) {
  const vm = useResumePanelViewModel(skills)
  const { draft } = vm

  return (
    <details className="card resume-panel">
      <summary>
        <span className="resume-panel-title">Résumé generator</span>
        <span className="muted"> · only you see this</span>
      </summary>

      {vm.status === 'loading' && <ResumeSkeleton />}
      {vm.status === 'error' && <ErrorState message={vm.errorMessage} onRetry={vm.retry} />}
      {draft && (
        <form
          className="editor-list"
          onSubmit={(e) => {
            e.preventDefault()
            vm.generate()
          }}
        >
          <CheckboxGroup label="Sections to include" options={vm.sectionOptions} value={draft.sections} onChange={vm.setSections} labelFor={vm.sectionLabel} />
          {vm.showSkills && <CheckboxGroup label="Skills to show" options={skills} value={vm.shownSkills} onChange={vm.setShownSkills} labelFor={vm.skillLabel} />}

          <div className="resume-actions">
            <button type="submit" className="button" disabled={vm.busy !== null}>
              {vm.generateLabel}
            </button>
            <button type="button" className="button button-secondary" disabled={vm.busy !== null} onClick={vm.save}>
              {vm.saveLabel}
            </button>
          </div>
          {vm.message && <p role="status">{vm.message}</p>}
          <ResumeDownloads generated={vm.generated} privateUrl={vm.privateUrl} publicUrl={vm.publicUrl} />
        </form>
      )}
    </details>
  )
}
