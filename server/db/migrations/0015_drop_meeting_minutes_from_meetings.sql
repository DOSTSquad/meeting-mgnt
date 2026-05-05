ALTER TABLE minutes
  ADD COLUMN IF NOT EXISTS key_discussions TEXT,
  ADD COLUMN IF NOT EXISTS decisions TEXT;

INSERT INTO minutes (meeting_id, prepared_by, content, key_discussions, decisions)
SELECT
  meetings.id,
  meetings.created_by,
  COALESCE(meetings.meeting_minutes, ''),
  meetings.key_discussions,
  meetings.decisions
FROM meetings
LEFT JOIN minutes ON minutes.meeting_id = meetings.id
WHERE minutes.id IS NULL
  AND (
    meetings.meeting_minutes IS NOT NULL
    OR meetings.key_discussions IS NOT NULL
    OR meetings.decisions IS NOT NULL
  );

UPDATE minutes
SET
  key_discussions = COALESCE(minutes.key_discussions, meetings.key_discussions),
  decisions = COALESCE(minutes.decisions, meetings.decisions)
FROM meetings
WHERE minutes.meeting_id = meetings.id
  AND (
    (minutes.key_discussions IS NULL AND meetings.key_discussions IS NOT NULL)
    OR (minutes.decisions IS NULL AND meetings.decisions IS NOT NULL)
  );

ALTER TABLE meetings
  DROP COLUMN IF EXISTS meeting_minutes,
  DROP COLUMN IF EXISTS key_discussions,
  DROP COLUMN IF EXISTS decisions;
