CREATE TABLE IF NOT EXISTS meeting_participants (
  meeting_id  UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
  role        TEXT NOT NULL DEFAULT 'attendee'
              CHECK (role IN ('organizer','attendee','optional')),
  rsvp_status TEXT NOT NULL DEFAULT 'pending'
              CHECK (rsvp_status IN ('pending','accepted','declined')),
  added_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS meeting_participants_user_idx ON meeting_participants (user_id);
