CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS tag_id UUID REFERENCES tags(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS meetings_tag_id_idx ON meetings (tag_id);

INSERT INTO tags (name)
VALUES ('marketing'), ('engineering'), ('software development')
ON CONFLICT (name) DO NOTHING;
