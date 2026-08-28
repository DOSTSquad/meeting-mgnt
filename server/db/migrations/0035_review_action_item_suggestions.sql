-- Reviewing generated action-item suggestions.
--
-- A suggestion is a proposal, not a task. Accepting one creates a real action
-- item; rejecting one keeps it for audit. Both are terminal.

ALTER TABLE analysis_action_item_suggestions
  -- The action item this suggestion produced. Kept on the suggestion rather than
  -- the item so a reviewer can trace either direction, and so acceptance is
  -- provably once: the row records what it created.
  ADD COLUMN IF NOT EXISTS accepted_action_item_id UUID
    REFERENCES action_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

DO $$
BEGIN
  -- A reviewed suggestion always records who reviewed it and when. Without this
  -- an accepted item has no accountable reviewer, which is the whole point of
  -- keeping generated content behind a review step.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'analysis_suggestions_reviewed_requires_reviewer'
      AND conrelid = 'analysis_action_item_suggestions'::regclass
  ) THEN
    ALTER TABLE analysis_action_item_suggestions
      ADD CONSTRAINT analysis_suggestions_reviewed_requires_reviewer
      CHECK (status = 'proposed' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL));
  END IF;

  -- Accepted means an action item exists; anything else means it does not.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'analysis_suggestions_accepted_links_item'
      AND conrelid = 'analysis_action_item_suggestions'::regclass
  ) THEN
    ALTER TABLE analysis_action_item_suggestions
      ADD CONSTRAINT analysis_suggestions_accepted_links_item
      CHECK (
        (status = 'accepted' AND accepted_action_item_id IS NOT NULL)
        OR (status <> 'accepted' AND accepted_action_item_id IS NULL)
      );
  END IF;
END $$;

-- One action item can only have come from one suggestion. Belt and braces
-- against a duplicate acceptance slipping past the status guard.
CREATE UNIQUE INDEX IF NOT EXISTS analysis_suggestions_one_item_idx
  ON analysis_action_item_suggestions (accepted_action_item_id)
  WHERE accepted_action_item_id IS NOT NULL;
