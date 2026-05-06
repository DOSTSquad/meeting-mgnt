import { VoteAvailabilityModal } from '../../features/dashboard/VoteAvailabilityModal.jsx'
import { CreateMeetingModal } from '../../features/meetings/CreateMeetingModal.jsx'
import { MeetingPreviewModal } from '../../features/meetings/MeetingPreviewModal.jsx'

export const AppModals = ({
  isCreateModalOpen,
  onCloseCreateModal,
  onCreatedMeeting,
  token,
  users,
  tags,
  meetings,
  meetingRequestId,
  currentUserId,
  activeAvailabilityRequest,
  onCloseAvailabilityRequest,
  onSubmittedAvailability,
  selectedMeetingDetail,
  isPreviewOpen,
  onClosePreview,
}) => (
  <>
    <CreateMeetingModal
      isOpen={isCreateModalOpen}
      onClose={onCloseCreateModal}
      onCreated={onCreatedMeeting}
      token={token}
      users={users}
      tags={tags}
      meetings={meetings}
      meetingRequestId={meetingRequestId}
      currentUserId={currentUserId}
    />

    <VoteAvailabilityModal
      request={activeAvailabilityRequest}
      token={token}
      isOpen={Boolean(activeAvailabilityRequest)}
      onClose={onCloseAvailabilityRequest}
      onSubmitted={onSubmittedAvailability}
    />
    <MeetingPreviewModal
      detail={selectedMeetingDetail}
      isOpen={isPreviewOpen}
      onClose={onClosePreview}
    />
  </>
)
