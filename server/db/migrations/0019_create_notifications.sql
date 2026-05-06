CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_feed_idx
  ON notifications (recipient_user_id, event_at DESC, id DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_user_unread_latest_idx
  ON notifications (recipient_user_id, event_at DESC, id DESC)
  WHERE read_at IS NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_entity_idx
  ON notifications (entity_type, entity_id);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_idempotency_key_idx
  ON notifications (recipient_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
