CREATE TABLE meeting_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL,
  user_id UUID NOT NULL,
  message TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (meeting_id, user_id)
    REFERENCES meeting_participants(meeting_id, user_id) ON DELETE CASCADE
);

CREATE INDEX meeting_change_requests_participant_idx
  ON meeting_change_requests (meeting_id, user_id, created_at DESC);
