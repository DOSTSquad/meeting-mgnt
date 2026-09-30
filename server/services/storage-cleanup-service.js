import { listStoredObjectSourcesForMeeting } from '../repositories/meeting-storage-repository.js'
import { removeObject } from './minio-client.js'

// Same layout the Python AI worker writes (ai-service/app/worker.py: ai-results/{kind}/{id}.json).
// The bucket is read here rather than from minio-client so that suites which mock that module
// with a fixed export list keep loading.
const aiResultsBucket = () => process.env.MINIO_BUCKET_AI_RESULTS || 'meeting-ai-results'

export const collectMeetingObjects = async (meetingId) => {
  const { objects, transcriptIds, analysisRunIds } =
    await listStoredObjectSourcesForMeeting(meetingId)
  const bucket = aiResultsBucket()

  return [
    ...objects,
    ...transcriptIds.map((id) => ({ bucket, key: `ai-results/transcriptions/${id}.json` })),
    ...analysisRunIds.map((id) => ({ bucket, key: `ai-results/analysis/${id}.json` })),
  ]
}

// Runs after the database delete has committed, so a storage failure leaves an orphaned object
// to clean up later rather than a row pointing at nothing. Only bucket, key and error code are
// logged; file names and transcript text are personal information.
export const removeObjectsBestEffort = async (objects, logger = console) => {
  const results = await Promise.allSettled(
    objects.map(({ bucket, key }) => removeObject(bucket, key))
  )

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.warn?.('Failed to remove stored object after delete', {
        bucket: objects[index].bucket,
        key: objects[index].key,
        code: result.reason?.code,
      })
    }
  })
}
