CREATE TABLE IF NOT EXISTS meeting_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
  timezone_name TEXT NOT NULL DEFAULT 'UTC',
  response_deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','collecting_availability','ready_to_confirm','confirmed','cancelled')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  confirmed_meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meeting_requests_created_by_idx
  ON meeting_requests (created_by);
CREATE INDEX IF NOT EXISTS meeting_requests_status_idx
  ON meeting_requests (status);

CREATE TABLE IF NOT EXISTS meeting_time_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_request_id UUID NOT NULL REFERENCES meeting_requests(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_selected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS meeting_time_options_request_idx
  ON meeting_time_options (meeting_request_id, sort_order, starts_at);

CREATE UNIQUE INDEX IF NOT EXISTS meeting_time_options_one_selected_idx
  ON meeting_time_options (meeting_request_id)
  WHERE is_selected = true;

CREATE TABLE IF NOT EXISTS meeting_request_invitees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_request_id UUID NOT NULL REFERENCES meeting_requests(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT,
  response_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (response_status IN ('pending','submitted')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE (meeting_request_id, email)
);

CREATE INDEX IF NOT EXISTS meeting_request_invitees_request_idx
  ON meeting_request_invitees (meeting_request_id);
CREATE INDEX IF NOT EXISTS meeting_request_invitees_user_idx
  ON meeting_request_invitees (user_id);

CREATE TABLE IF NOT EXISTS meeting_time_option_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_option_id UUID NOT NULL REFERENCES meeting_time_options(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES meeting_request_invitees(id) ON DELETE CASCADE,
  is_available BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (time_option_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS meeting_time_option_responses_invitee_idx
  ON meeting_time_option_responses (invitee_id);
