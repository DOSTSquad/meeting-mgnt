ALTER TABLE meeting_request_invitees
  ADD COLUMN IF NOT EXISTS invitation_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS meeting_request_invitees_token_hash_idx
  ON meeting_request_invitees (invitation_token_hash)
  WHERE invitation_token_hash IS NOT NULL;
