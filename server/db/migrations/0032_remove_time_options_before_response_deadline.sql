DELETE FROM meeting_time_options AS time_option
USING meeting_requests AS meeting_request
WHERE time_option.meeting_request_id = meeting_request.id
  AND time_option.starts_at <= meeting_request.response_deadline;
