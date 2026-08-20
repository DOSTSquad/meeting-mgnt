CREATE TABLE IF NOT EXISTS analysis_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id    UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  recording_id  UUID REFERENCES meeting_recordings(id) ON DELETE SET NULL,
  transcript_id UUID REFERENCES meeting_transcripts(id) ON DELETE SET NULL,
  created_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','running','completed','failed','cancelled')),
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  CHECK (completed_at IS NULL OR status = 'completed')
);

CREATE INDEX IF NOT EXISTS analysis_runs_meeting_idx
  ON analysis_runs (meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analysis_runs_status_idx
  ON analysis_runs (status);
CREATE INDEX IF NOT EXISTS analysis_runs_transcript_idx
  ON analysis_runs (transcript_id);
CREATE INDEX IF NOT EXISTS analysis_runs_recording_idx
  ON analysis_runs (recording_id);

CREATE UNIQUE INDEX IF NOT EXISTS analysis_runs_one_processing_recording_idx
  ON analysis_runs (recording_id)
  WHERE recording_id IS NOT NULL
    AND status IN ('queued','running');

CREATE UNIQUE INDEX IF NOT EXISTS analysis_runs_one_processing_transcript_idx
  ON analysis_runs (transcript_id)
  WHERE transcript_id IS NOT NULL
    AND status IN ('queued','running');

CREATE TABLE IF NOT EXISTS analysis_action_item_suggestions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  meeting_id      UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  assignee_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  due_date        TIMESTAMPTZ,
  priority        TEXT NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low','medium','high')),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','rejected')),
  source_ref      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analysis_action_item_suggestions_run_idx
  ON analysis_action_item_suggestions (analysis_run_id, created_at);
CREATE INDEX IF NOT EXISTS analysis_action_item_suggestions_meeting_idx
  ON analysis_action_item_suggestions (meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analysis_action_item_suggestions_status_idx
  ON analysis_action_item_suggestions (status);

CREATE TABLE IF NOT EXISTS workflow_outbox (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type     TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id   UUID NOT NULL,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','processing','dispatched','failed')),
  attempts       INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  leased_until   TIMESTAMPTZ,
  locked_by      TEXT,
  last_error     TEXT,
  dispatched_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS workflow_outbox_event_once_idx
  ON workflow_outbox (event_type, aggregate_type, aggregate_id);

CREATE INDEX IF NOT EXISTS workflow_outbox_claim_idx
  ON workflow_outbox (status, available_at, created_at)
  WHERE status IN ('pending','failed','processing');

CREATE INDEX IF NOT EXISTS workflow_outbox_aggregate_idx
  ON workflow_outbox (aggregate_type, aggregate_id);
