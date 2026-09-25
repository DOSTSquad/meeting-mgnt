INSERT INTO notifications (
  recipient_user_id, type, entity_type, entity_id, title, detail, event_at, read_at, idempotency_key
)
SELECT m.owner_id, 'meeting_change_requested', 'meeting', r.meeting_id, m.title,
  u.name || ': ' || r.message, r.created_at, r.read_at, 'meeting_change_requested:' || r.id::text
FROM meeting_change_requests r
JOIN meetings m ON m.id = r.meeting_id
JOIN users u ON u.id = r.user_id
ON CONFLICT (recipient_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL DO NOTHING;
