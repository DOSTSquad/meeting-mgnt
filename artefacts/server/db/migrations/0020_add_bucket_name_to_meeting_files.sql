ALTER TABLE meeting_files
  ADD COLUMN IF NOT EXISTS bucket_name TEXT;

UPDATE meeting_files
SET bucket_name = COALESCE(bucket_name, 'meeting-files')
WHERE bucket_name IS NULL;

ALTER TABLE meeting_files
  ALTER COLUMN bucket_name SET NOT NULL;

ALTER TABLE meeting_files
  ALTER COLUMN bucket_name SET DEFAULT 'meeting-files';
