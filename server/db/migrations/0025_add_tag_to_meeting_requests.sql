ALTER TABLE meeting_requests
  ADD COLUMN IF NOT EXISTS tag TEXT
  CHECK (tag IS NULL OR char_length(tag) <= 100);
