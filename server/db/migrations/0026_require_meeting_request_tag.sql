UPDATE meeting_requests
SET tag = 'uncategorized'
WHERE tag IS NULL OR btrim(tag) = '';

ALTER TABLE meeting_requests
  ALTER COLUMN tag SET NOT NULL;

ALTER TABLE meeting_requests
  ADD CONSTRAINT meeting_requests_tag_not_blank_check
  CHECK (btrim(tag) <> '');
