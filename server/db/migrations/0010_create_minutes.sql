CREATE TABLE IF NOT EXISTS minutes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id       UUID NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  summary_id       UUID REFERENCES meeting_summaries(id) ON DELETE SET NULL,
  prepared_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  content          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','approved','published')),
  version          INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  approved_at      TIMESTAMPTZ,
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (approved_at IS NULL OR status IN ('approved','published')),
  CHECK (published_at IS NULL OR status = 'published')
);

CREATE INDEX IF NOT EXISTS minutes_status_idx
  ON minutes (status);
CREATE INDEX IF NOT EXISTS minutes_prepared_by_idx
  ON minutes (prepared_by);
CREATE INDEX IF NOT EXISTS minutes_approved_by_idx
  ON minutes (approved_by);
