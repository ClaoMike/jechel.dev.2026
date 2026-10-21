import { PersonIcon } from '../../../../components/icons/icons'

/** The photo, or a placeholder without one. `url` is already checked (isSafeUrl). */
export function ProfilePhoto({ url }: { url: string | null }) {
  return url ? (
    <img className="profile-photo" src={url} alt="Claudiu Jechel" />
  ) : (
    <div className="profile-photo profile-photo-placeholder" role="img" aria-label="Photo placeholder">
      <PersonIcon size={64} />
    </div>
  )
}
