import { query } from '../db/postgres.js'

const toObjectRefs = (rows) => rows.map((row) => ({ bucket: row.bucket_name, key: row.object_key }))

// Everything a meeting delete cascades away that also has a stored object. Archived recordings
// are included: replacing a recording archives the row but the DB delete removes it all the same.
export const listStoredObjectSourcesForMeeting = async (meetingId) => {
  const [files, recordings, transcripts, analysisRuns] = await Promise.all([
    query('SELECT bucket_name, object_key FROM meeting_files WHERE meeting_id = $1', [meetingId]),
    query('SELECT bucket_name, object_key FROM meeting_recordings WHERE meeting_id = $1', [
      meetingId,
    ]),
    query('SELECT id FROM meeting_transcripts WHERE meeting_id = $1', [meetingId]),
    query('SELECT id FROM analysis_runs WHERE meeting_id = $1', [meetingId]),
  ])

  return {
    objects: [...toObjectRefs(files.rows), ...toObjectRefs(recordings.rows)],
    transcriptIds: transcripts.rows.map((row) => row.id),
    analysisRunIds: analysisRuns.rows.map((row) => row.id),
  }
}
