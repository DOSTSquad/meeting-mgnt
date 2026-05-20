CREATE INDEX IF NOT EXISTS meeting_files_file_name_tsv_idx
  ON meeting_files
  USING GIN (
    to_tsvector('simple', regexp_replace(COALESCE(file_name, ''), '[^[:alnum:]]+', ' ', 'g'))
  );
