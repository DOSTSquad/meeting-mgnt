CREATE TABLE IF NOT EXISTS meeting_transcripts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id       UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  source_file_id   UUID REFERENCES meeting_files(id) ON DELETE SET NULL,
  created_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status           TEXT NOT NULL DEFAULT 'processing'
                    CHECK (status IN ('processing','completed','failed')),
  language_code    TEXT,
  provider         TEXT,
  model            TEXT,
  transcript_text  TEXT,
  segments         JSONB NOT NULL DEFAULT '[]'::jsonb
                    CHECK (jsonb_typeof(segments) = 'array'),
  confidence       NUMERIC
                    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  duration_seconds INTEGER
                    CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  CHECK (completed_at IS NULL OR status = 'completed')
);

CREATE INDEX IF NOT EXISTS meeting_transcripts_meeting_idx
  ON meeting_transcripts (meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS meeting_transcripts_status_idx
  ON meeting_transcripts (status);
CREATE INDEX IF NOT EXISTS meeting_transcripts_source_file_idx
  ON meeting_transcripts (source_file_id);

CREATE UNIQUE INDEX IF NOT EXISTS meeting_transcripts_source_file_unique_idx
  ON meeting_transcripts (source_file_id)
  WHERE source_file_id IS NOT NULL;
