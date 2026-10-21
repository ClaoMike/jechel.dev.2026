import { ErrorState } from '../../../../components/ErrorState/ErrorState'
import { EditableSection } from '../../section/EditableSection/EditableSection'
import { PrivateContact } from '../PrivateContact/PrivateContact'
import { ProfileEditor } from '../ProfileEditor/ProfileEditor'
import { ProfileLinks } from '../ProfileLinks/ProfileLinks'
import { ProfilePhoto } from '../ProfilePhoto/ProfilePhoto'
import { StatusChips } from '../StatusChips/StatusChips'
import { useProfileSectionViewModel, type ProfileSectionProps } from './ProfileSection.viewModel'

/**
 * The photo, then citizenship / residence labels, then the résumé / GitHub / LeetCode / LinkedIn /
 * Instagram links. The LeetCode username is set in the "Problem solving" section. The résumé is
 * generated (the panel above); for the admin, this section also holds its private contact details.
 */
export function ProfileSection(props: ProfileSectionProps) {
  const vm = useProfileSectionViewModel(props)

  return (
    <EditableSection
      title="Photo and links"
      hideTitle
      errorKeys={['photoUrl', 'statuses', 'links', 'contact']}
      className="profile-card"
      value={props.value}
      canEdit={props.canEdit}
      onSave={props.onSave}
      editor={ProfileEditor}
    >
      <div className="profile">
        <ProfilePhoto url={vm.photoUrl} />
        <p className="profile-name">Claudiu Mihai Jechel</p>
        <StatusChips statuses={vm.statuses} showEmpty={vm.showNoStatuses} />
        <ProfileLinks links={vm.links} />
        {vm.privateContact !== null && <PrivateContact text={vm.privateContact} />}
        {vm.contactError && <ErrorState compact message={vm.contactError.message} onRetry={vm.contactError.retry} />}
      </div>
    </EditableSection>
  )
}
