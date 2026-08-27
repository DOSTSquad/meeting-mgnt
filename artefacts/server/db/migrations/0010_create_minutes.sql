CREATE TABLE IF NOT EXISTS minutes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id       UUID NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  summary_id       UUID REFERENCES meeting_summaries(id) ON DELETE SET NULL,
  prepared_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  content          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft',
  version          INTEGER NOT NULL DEFAULT 1,
  approved_at      TIMESTAMPTZ,
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE minutes
  ADD COLUMN IF NOT EXISTS summary_id UUID REFERENCES meeting_summaries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prepared_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'minutes'
      AND column_name = 'body'
  ) THEN
    UPDATE minutes
    SET content = body
    WHERE content IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'minutes'
      AND column_name = 'created_by'
  ) THEN
    UPDATE minutes
    SET prepared_by = created_by
    WHERE prepared_by IS NULL;
  END IF;
END $$;

UPDATE minutes
SET
  content = COALESCE(content, ''),
  status = COALESCE(status, 'draft'),
  version = COALESCE(version, 1);

ALTER TABLE minutes
  ALTER COLUMN prepared_by SET NOT NULL,
  ALTER COLUMN content SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'draft',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN version SET DEFAULT 1,
  ALTER COLUMN version SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'minutes'
      AND c.conname = 'minutes_status_check'
  ) THEN
    ALTER TABLE minutes
      ADD CONSTRAINT minutes_status_check CHECK (status IN ('draft','approved','published'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'minutes'
      AND c.conname = 'minutes_version_check'
  ) THEN
    ALTER TABLE minutes
      ADD CONSTRAINT minutes_version_check CHECK (version > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'minutes'
      AND c.conname = 'minutes_approved_at_status_check'
  ) THEN
    ALTER TABLE minutes
      ADD CONSTRAINT minutes_approved_at_status_check
      CHECK (approved_at IS NULL OR status IN ('approved','published'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'minutes'
      AND c.conname = 'minutes_published_at_status_check'
  ) THEN
    ALTER TABLE minutes
      ADD CONSTRAINT minutes_published_at_status_check
      CHECK (published_at IS NULL OR status = 'published');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS minutes_status_idx
  ON minutes (status);
CREATE INDEX IF NOT EXISTS minutes_prepared_by_idx
  ON minutes (prepared_by);
CREATE INDEX IF NOT EXISTS minutes_approved_by_idx
  ON minutes (approved_by);
