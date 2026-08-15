ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS calendar_sequence INTEGER NOT NULL DEFAULT 0
CHECK (calendar_sequence >= 0);
