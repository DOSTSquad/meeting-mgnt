// Keyed by recording id so the dialog closes by itself when the recording is removed or replaced.
export const isRemoveDialogOpen = (recording, dialogRecordingId) =>
  Boolean(recording) && dialogRecordingId != null && recording.id === dialogRecordingId
