-- Analysis results and provenance.
--
-- Action-item suggestions already have their own table (0033) because they are
-- promoted into real action items later. Summary, key discussions, and decisions
-- are read-only review content that is always loaded together with the run, so
-- they live on the run itself rather than in three more tables.

ALTER TABLE analysis_runs
  ADD COLUMN IF NOT EXISTS summary          TEXT,
  ADD COLUMN IF NOT EXISTS key_discussions  JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS decisions        JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Provenance. A generated result is worthless for review if nobody can tell
  -- which transcript, provider, model, and prompt produced it. transcript_id is
  -- already on the table and completes the set.
  ADD COLUMN IF NOT EXISTS provider         TEXT,
  ADD COLUMN IF NOT EXISTS model            TEXT,
  ADD COLUMN IF NOT EXISTS prompt_version   TEXT;

DO $$
BEGIN
  -- A run cannot be offered for review without the provenance needed to judge
  -- it. Enforced in the database so no future writer can skip it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'analysis_runs_ready_requires_provenance'
      AND conrelid = 'analysis_runs'::regclass
  ) THEN
    ALTER TABLE analysis_runs
      ADD CONSTRAINT analysis_runs_ready_requires_provenance
      CHECK (
        status <> 'ready_for_review'
        OR (
          summary IS NOT NULL
          AND transcript_id IS NOT NULL
          AND provider IS NOT NULL
          AND model IS NOT NULL
          AND prompt_version IS NOT NULL
        )
      );
  END IF;
END $$;

-- Evidence references point at segments of the transcript the run was built
-- from. Kept as a JSONB array of segment indexes alongside each suggestion so a
-- reviewer can jump to the passage that justified it.
ALTER TABLE analysis_action_item_suggestions
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '[]'::jsonb;
