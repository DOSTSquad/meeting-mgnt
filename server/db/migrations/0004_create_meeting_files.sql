CREATE TABLE IF NOT EXISTS meeting_files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id   UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  uploaded_by  UUID NOT NULL REFERENCES users(id)   ON DELETE RESTRICT,
  file_name    TEXT NOT NULL,          -- original filename, for display
  mime_type    TEXT NOT NULL,
  size_bytes   BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  object_key   TEXT NOT NULL UNIQUE,   -- meetings/{meetingId}/{id}
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meeting_files_meeting_idx ON meeting_files (meeting_id, created_at DESC);
