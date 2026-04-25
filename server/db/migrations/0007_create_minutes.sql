CREATE TABLE IF NOT EXISTS minutes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  UUID NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  body        TEXT NOT NULL DEFAULT '',
  created_by  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS minutes_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  minutes_id  UUID NOT NULL REFERENCES minutes(id) ON DELETE CASCADE,
  version     INT  NOT NULL,
  body        TEXT NOT NULL,
  edited_by   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  edited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (minutes_id, version)
);

CREATE INDEX IF NOT EXISTS minutes_versions_minutes_idx
  ON minutes_versions (minutes_id, version DESC);

-- Backfill existing meetings with the default template
INSERT INTO minutes (meeting_id, body, created_by, updated_by)
SELECT id,
       E'# Meeting Minutes\n\n## Attendees\n\n## Agenda\n\n## Discussion\n\n## Decisions\n\n## Action Items\n',
       created_by,
       created_by
FROM meetings
ON CONFLICT (meeting_id) DO NOTHING;

INSERT INTO minutes_versions (minutes_id, version, body, edited_by)
SELECT id, 1, body, created_by
FROM minutes
WHERE NOT EXISTS (
  SELECT 1 FROM minutes_versions v WHERE v.minutes_id = minutes.id
);
