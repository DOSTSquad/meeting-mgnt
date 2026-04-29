CREATE TABLE IF NOT EXISTS meeting_recordings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id       UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  uploaded_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  file_name        TEXT NOT NULL,
  mime_type        TEXT NOT NULL,
  size_bytes       BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 524288000),
  object_key       TEXT NOT NULL UNIQUE,
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  recorded_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meeting_recordings_meeting_idx
  ON meeting_recordings (meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS meeting_recordings_uploaded_by_idx
  ON meeting_recordings (uploaded_by);
