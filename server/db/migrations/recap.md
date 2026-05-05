Migration audit recap

- Checked migrations 0001 through 0011 for duplicated relations/schema.
- Found duplicate equivalent indexes:
  - `meeting_participants_user_idx` and `meeting_participants_user_id_idx` both index `meeting_participants(user_id)`.
  - `meeting_recordings_uploaded_by_idx` and `meeting_recordings_uploaded_by_fk_idx` both index `meeting_recordings(uploaded_by)`.
- Found one likely redundant index pair:
  - `meeting_transcripts_source_file_idx` is mostly covered by partial unique index `meeting_transcripts_source_file_unique_idx` for non-null source file lookups.
- No duplicate table definitions found.
- No duplicate foreign-key constraints found beyond normal repeated references to shared parent tables such as `users` and `meetings`.
- Next target: remove or avoid creating the duplicate/redundant indexes if the affected migrations have not already shipped/applied; otherwise add a cleanup migration to drop them.
