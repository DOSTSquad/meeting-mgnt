ALTER TABLE minutes
  ADD COLUMN IF NOT EXISTS facilitator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recorder_id UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE minutes
SET facilitator_id = facilitator_user.id
FROM meetings
JOIN users facilitator_user ON LOWER(facilitator_user.name) = LOWER(TRIM(meetings.facilitator))
WHERE minutes.meeting_id = meetings.id
  AND minutes.facilitator_id IS NULL
  AND meetings.facilitator IS NOT NULL
  AND TRIM(meetings.facilitator) <> '';

UPDATE minutes
SET recorder_id = recorder_user.id
FROM meetings
JOIN users recorder_user ON LOWER(recorder_user.name) = LOWER(TRIM(meetings.recorder))
WHERE minutes.meeting_id = meetings.id
  AND minutes.recorder_id IS NULL
  AND meetings.recorder IS NOT NULL
  AND TRIM(meetings.recorder) <> '';

CREATE INDEX IF NOT EXISTS minutes_facilitator_id_idx
  ON minutes (facilitator_id);
CREATE INDEX IF NOT EXISTS minutes_recorder_id_idx
  ON minutes (recorder_id);

DROP INDEX IF EXISTS meetings_department_idx;

ALTER TABLE meetings
  DROP COLUMN IF EXISTS department,
  DROP COLUMN IF EXISTS facilitator,
  DROP COLUMN IF EXISTS recorder;
