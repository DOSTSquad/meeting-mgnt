-- Deleting an action item that came from an accepted suggestion failed with a
-- constraint violation, so those items could not be deleted at all.
--
-- 0035 gave accepted_action_item_id ON DELETE SET NULL while also asserting that
-- an accepted suggestion always links an item. Removing the item fired the FK,
-- which nulled the column and left status = 'accepted', and the two rules then
-- contradicted each other.
--
-- The suggestion has to survive: what was proposed and who reviewed it is part of
-- the record, and cascading the delete would erase it. So acceptance gains an
-- end state. 'withdrawn' says the suggestion was accepted and the item it created
-- has since been deleted, which is exactly what happened and is not the same as
-- having been rejected at review time.

ALTER TABLE analysis_action_item_suggestions
  DROP CONSTRAINT IF EXISTS analysis_action_item_suggestions_status_check;

ALTER TABLE analysis_action_item_suggestions
  ADD CONSTRAINT analysis_action_item_suggestions_status_check
  CHECK (status = ANY (ARRAY['proposed', 'accepted', 'rejected', 'withdrawn']));

-- Only 'accepted' still requires a linked item. 'withdrawn' requires the absence
-- of one, which keeps the column honest rather than merely permissive: a
-- withdrawn row cannot quietly keep pointing at something.
ALTER TABLE analysis_action_item_suggestions
  DROP CONSTRAINT IF EXISTS analysis_suggestions_accepted_links_item;

ALTER TABLE analysis_action_item_suggestions
  ADD CONSTRAINT analysis_suggestions_accepted_links_item
  CHECK (
    (status = 'accepted' AND accepted_action_item_id IS NOT NULL)
    OR (status <> 'accepted' AND accepted_action_item_id IS NULL)
  );

-- BEFORE DELETE, so the row is already consistent by the time the foreign key's
-- SET NULL runs. An AFTER trigger cannot work here: the constraint is checked as
-- part of the FK's own update, before AFTER triggers fire.
--
-- reviewed_by and reviewed_at are left alone. They record who accepted the
-- suggestion, which remains true; the deletion of the item is a later event and
-- is timestamped by updated_at.
CREATE OR REPLACE FUNCTION withdraw_suggestion_for_deleted_action_item()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE analysis_action_item_suggestions
     SET status = 'withdrawn',
         accepted_action_item_id = NULL,
         updated_at = NOW()
   WHERE accepted_action_item_id = OLD.id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS action_items_withdraw_suggestion ON action_items;

CREATE TRIGGER action_items_withdraw_suggestion
  BEFORE DELETE ON action_items
  FOR EACH ROW
  EXECUTE FUNCTION withdraw_suggestion_for_deleted_action_item();
