-- When the AI worker actually began each step, as opposed to when it was
-- requested. created_at is set when generation is requested, so created_at ->
-- completed_at would include queue wait (and, for analysis, the whole
-- transcription). Existing rows stay NULL and simply show no duration.

ALTER TABLE meeting_transcripts
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE analysis_runs
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
