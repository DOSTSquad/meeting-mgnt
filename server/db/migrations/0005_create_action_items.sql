CREATE TABLE IF NOT EXISTS action_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id      UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  assignee_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  due_date        TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'todo'
                    CHECK (status IN ('todo','in_progress','blocked','completed','cancelled')),
  priority        TEXT NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('low','medium','high')),
  source          TEXT NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual','ai')),
  source_ref      TEXT,
  created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS action_items_meeting_idx  ON action_items (meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS action_items_assignee_idx ON action_items (assignee_id);
CREATE INDEX IF NOT EXISTS action_items_status_idx   ON action_items (status);
