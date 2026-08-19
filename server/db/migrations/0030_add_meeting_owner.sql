ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE RESTRICT;

UPDATE meetings
SET owner_id = created_by
WHERE owner_id IS NULL;

ALTER TABLE meetings
  ALTER COLUMN owner_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS meetings_owner_id_idx ON meetings (owner_id);

ALTER TABLE meeting_requests
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE RESTRICT;

UPDATE meeting_requests
SET owner_id = created_by
WHERE owner_id IS NULL;

ALTER TABLE meeting_requests
  ALTER COLUMN owner_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS meeting_requests_owner_id_idx ON meeting_requests (owner_id);
