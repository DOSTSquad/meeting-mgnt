ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS meeting_minutes TEXT;
