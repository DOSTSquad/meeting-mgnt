export const uploadMeetingFile = async (
  client,
  meetingId,
  file,
  description,
  storageKind = 'file'
) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('description', description)
  formData.append('storageKind', storageKind)

  const response = await client.post(`/api/meetings/${meetingId}/files`, formData)
  return response.data.file
}

export const downloadFileContent = async (client, fileId) => {
  const response = await client.get(`/api/files/${fileId}/content`, {
    responseType: 'blob',
  })

  return response.data
}
