import { PersonIcon } from '../../../../components/icons/icons'
import { strings } from '../../../../strings'

/** The photo, or a placeholder without one. `url` is already checked (isSafeUrl). */
export function ProfilePhoto({ url }: { url: string | null }) {
  return url ? (
    <img className="profile-photo" src={url} alt={strings.profilePhoto.claudiuJechel} />
  ) : (
    <div className="profile-photo profile-photo-placeholder" role="img" aria-label={strings.profilePhoto.photoPlaceholder}>
      <PersonIcon size={64} />
    </div>
  )
}
