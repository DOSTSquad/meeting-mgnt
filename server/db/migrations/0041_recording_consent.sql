-- Who confirmed, and when, that every participant agreed to the recording. Recordings uploaded
-- before this migration stay NULL: nobody confirmed anything at the time.
ALTER TABLE meeting_recordings
  ADD COLUMN IF NOT EXISTS consent_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL;
