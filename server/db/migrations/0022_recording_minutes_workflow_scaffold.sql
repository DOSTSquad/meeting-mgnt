ALTER TABLE meeting_recordings
  ADD COLUMN IF NOT EXISTS bucket_name TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

UPDATE meeting_recordings
SET bucket_name = COALESCE(bucket_name, 'meeting-audio');

ALTER TABLE meeting_recordings
  ALTER COLUMN bucket_name SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'meeting_recordings_status_check'
      AND conrelid = 'meeting_recordings'::regclass
  ) THEN
    ALTER TABLE meeting_recordings
      ADD CONSTRAINT meeting_recordings_status_check
      CHECK (status IN ('uploaded', 'transcribing', 'transcribed', 'failed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS meeting_recordings_one_active_per_meeting_idx
  ON meeting_recordings (meeting_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS meeting_recordings_status_idx
  ON meeting_recordings (status)
  WHERE archived_at IS NULL;

ALTER TABLE meeting_transcripts
  ADD COLUMN IF NOT EXISTS recording_id UUID REFERENCES meeting_recordings(id) ON DELETE SET NULL,
  DROP COLUMN IF EXISTS language_code,
  DROP COLUMN IF EXISTS provider,
  DROP COLUMN IF EXISTS model,
  DROP COLUMN IF EXISTS confidence;

CREATE INDEX IF NOT EXISTS meeting_transcripts_recording_id_idx
  ON meeting_transcripts (recording_id);

ALTER TABLE minutes
  ADD COLUMN IF NOT EXISTS generated_from_transcript_id UUID REFERENCES meeting_transcripts(id) ON DELETE SET NULL,
  DROP COLUMN IF EXISTS summary_id,
  DROP COLUMN IF EXISTS body,
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS updated_by;

CREATE INDEX IF NOT EXISTS minutes_generated_from_transcript_id_idx
  ON minutes (generated_from_transcript_id);

DROP TABLE IF EXISTS meeting_summaries;
