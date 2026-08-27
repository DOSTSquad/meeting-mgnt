CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  timezone_name TEXT NOT NULL DEFAULT 'UTC',
  location TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  department TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS meetings_starts_at_idx ON meetings (starts_at);
CREATE INDEX IF NOT EXISTS meetings_status_idx     ON meetings (status);
CREATE INDEX IF NOT EXISTS meetings_department_idx ON meetings (department);
