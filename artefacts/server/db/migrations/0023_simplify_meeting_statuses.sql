UPDATE meetings
SET status = 'scheduled'
WHERE status = 'in_progress';

ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_status_check;

ALTER TABLE meetings ADD CONSTRAINT meetings_status_check
  CHECK (status IN ('scheduled','completed','cancelled','archived'));
