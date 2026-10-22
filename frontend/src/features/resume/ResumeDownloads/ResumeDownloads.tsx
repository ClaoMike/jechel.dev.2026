import { DownloadIcon, PhoneIcon } from '../../../components/icons/icons'

/** When the résumés were last made, and both to download: the private one (with the email and phone) and the public one. */
export function ResumeDownloads({ generated, privateUrl, publicUrl }: { generated: string | null; privateUrl: string; publicUrl: string }) {
  if (!generated) return <p className="muted">Not generated yet.</p>
  return (
    <div className="resume-downloads">
      <p className="muted">{generated}</p>
      <div className="resume-actions">
        <a className="button button-secondary" href={privateUrl} download>
          <PhoneIcon />
          Download private copy
        </a>
        <a className="button button-secondary" href={publicUrl} download>
          <DownloadIcon />
          Download public copy
        </a>
      </div>
    </div>
  )
}
