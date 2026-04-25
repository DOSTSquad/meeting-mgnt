CREATE TABLE IF NOT EXISTS minutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS minutes_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  minutes_id UUID NOT NULL REFERENCES minutes(id) ON DELETE CASCADE,
  version INT NOT NULL,
  body TEXT NOT NULL,
  edited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (minutes_id, version)
);

CREATE INDEX IF NOT EXISTS minutes_versions_minutes_version_idx
  ON minutes_versions (minutes_id, version DESC);

WITH inserted_minutes AS (
  INSERT INTO minutes (meeting_id, body, created_by, updated_by)
  SELECT
    meetings.id,
    '# Meeting Minutes

## Attendees

- 

## Agenda

- 

## Discussion

-

## Decisions

-

## Action Items

- [ ] 
',
    meetings.created_by,
    meetings.created_by
  FROM meetings
  WHERE TRUE
  ON CONFLICT (meeting_id) DO NOTHING
  RETURNING id, body, created_by
)
INSERT INTO minutes_versions (minutes_id, version, body, edited_by)
SELECT id, 1, body, created_by
FROM inserted_minutes
ON CONFLICT (minutes_id, version) DO NOTHING;
