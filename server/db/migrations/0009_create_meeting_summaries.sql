CREATE TABLE IF NOT EXISTS meeting_summaries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id       UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  transcript_id    UUID REFERENCES meeting_transcripts(id) ON DELETE SET NULL,
  created_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  summary_text     TEXT NOT NULL,
  key_points       JSONB NOT NULL DEFAULT '[]'::jsonb
                    CHECK (jsonb_typeof(key_points) = 'array'),
  decisions        JSONB NOT NULL DEFAULT '[]'::jsonb
                    CHECK (jsonb_typeof(decisions) = 'array'),
  action_items     JSONB NOT NULL DEFAULT '[]'::jsonb
                    CHECK (jsonb_typeof(action_items) = 'array'),
  provider         TEXT,
  model            TEXT,
  status           TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','final')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at     TIMESTAMPTZ,
  CHECK (finalized_at IS NULL OR status = 'final')
);

CREATE INDEX IF NOT EXISTS meeting_summaries_meeting_idx
  ON meeting_summaries (meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS meeting_summaries_transcript_idx
  ON meeting_summaries (transcript_id);
CREATE INDEX IF NOT EXISTS meeting_summaries_status_idx
  ON meeting_summaries (status);
