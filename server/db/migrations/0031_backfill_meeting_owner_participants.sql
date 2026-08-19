INSERT INTO meeting_participants (meeting_id, user_id, role, added_by)
SELECT id, owner_id, 'organizer', created_by
FROM meetings
ON CONFLICT (meeting_id, user_id) DO UPDATE
SET role = 'organizer';
