-- Full-text search support for transcript queries such as:
-- WHERE to_tsvector('english', transcript_text) @@ plainto_tsquery('english', $1)
CREATE INDEX IF NOT EXISTS meeting_transcripts_transcript_text_tsv_idx
  ON meeting_transcripts
  USING GIN (to_tsvector('english', COALESCE(transcript_text, '')));

-- Foreign-key support indexes for common joins/filtering.
CREATE INDEX IF NOT EXISTS meetings_created_by_idx
  ON meetings (created_by);
CREATE INDEX IF NOT EXISTS action_items_created_by_idx
  ON action_items (created_by);
CREATE INDEX IF NOT EXISTS meeting_participants_user_id_idx
  ON meeting_participants (user_id);
CREATE INDEX IF NOT EXISTS meeting_files_uploaded_by_idx
  ON meeting_files (uploaded_by);
CREATE INDEX IF NOT EXISTS meeting_transcripts_created_by_idx
  ON meeting_transcripts (created_by);
CREATE INDEX IF NOT EXISTS meeting_recordings_uploaded_by_fk_idx
  ON meeting_recordings (uploaded_by);
CREATE INDEX IF NOT EXISTS meeting_summaries_created_by_idx
  ON meeting_summaries (created_by);
CREATE INDEX IF NOT EXISTS minutes_summary_id_idx
  ON minutes (summary_id);

-- Additional status filters for recently added tables.
CREATE INDEX IF NOT EXISTS meeting_recordings_recorded_at_idx
  ON meeting_recordings (recorded_at DESC)
  WHERE recorded_at IS NOT NULL;
