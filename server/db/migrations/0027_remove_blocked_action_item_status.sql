UPDATE action_items
SET
  status = CASE WHEN random() < 0.5 THEN 'todo' ELSE 'in_progress' END,
  updated_at = NOW()
WHERE status = 'blocked';

ALTER TABLE action_items
  DROP CONSTRAINT action_items_status_check;

ALTER TABLE action_items
  ADD CONSTRAINT action_items_status_check
  CHECK (status IN ('todo','in_progress','completed','cancelled'));
