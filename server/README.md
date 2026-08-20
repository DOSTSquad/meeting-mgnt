Express API for DOST Meeting Management System.

## Run

Start the API with `npm run dev --workspace=server`.

The default port is `3001`, configurable through `PORT` in `.env`.

## Rate Limiting

All `/api/*` routes are rate limited by client IP. Defaults are `100` requests per
`900000` ms (15 minutes), configurable with `RATE_LIMIT_MAX` and
`RATE_LIMIT_WINDOW_MS`. Requests over the limit return `429` with
`{ "error": "Too many requests, please try again later" }`.

When the API runs behind a same-host reverse proxy such as Caddy, set
`TRUST_PROXY=true` so Express uses the forwarded client IP instead of the proxy's
loopback address.

## Migrations

Run database migrations with `npm run migrate --workspace=server`.

Migrations are located in `server/db/migrations` and tracked in `schema_migrations`.

## Recording Workflow Queue

When `AI_PIPELINE_ENABLED=true`, the API starts a workflow outbox dispatcher that polls PostgreSQL
and publishes durable recording workflows to BullMQ. Redis is used for delivery, retries, locks,
and flow dependencies only; PostgreSQL remains the source of truth for user-visible workflow state.

```env
REDIS_URL=redis://localhost:6379
AI_PIPELINE_ENABLED=true
RECORDING_TRANSCRIPTION_QUEUE_NAME=recording-transcription
RECORDING_ANALYSIS_QUEUE_NAME=recording-analysis
WORKFLOW_OUTBOX_DISPATCH_INTERVAL_MS=5000
WORKFLOW_OUTBOX_DISPATCH_LIMIT=25
WORKFLOW_OUTBOX_LEASE_SECONDS=60
WORKFLOW_OUTBOX_RETRY_DELAY_SECONDS=30
```

## Email Delivery

Meeting invitations and confirmations use the provider selected by `EMAIL_PROVIDER`. The default
is `smtp` for compatibility with existing deployments. Provider selection is explicit; a failed
SMTP delivery does not fall back to Resend.

Common configuration:

```env
EMAIL_PROVIDER=smtp
EMAIL_FROM="Meeting Management <meeting-service@gmail.com>"
CLIENT_URL=http://localhost:5173
INVITATION_TOKEN_TTL_DAYS=7
```

For Gmail SMTP, enable two-factor authentication and use a Google App Password rather than the
account password:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=meeting-service@gmail.com
SMTP_PASSWORD=<google-app-password>
```

Existing SMTP deployments may continue using `SMTP_FROM` when `EMAIL_FROM` is not set. The SMTP
transport bounds connection, greeting, and socket waits so blocked outbound mail ports fail before
the HTTP request reaches a proxy timeout.

For environments where outbound SMTP is unavailable, Resend sends through HTTPS on port 443:

```env
EMAIL_PROVIDER=resend
EMAIL_FROM="Meeting Management <meetings@mail.example.com>"
RESEND_API_KEY=<resend-api-key>
```

The domain in `EMAIL_FROM` must be verified in Resend. Resend requests time out after 10 seconds.
Invitation links use random credentials; only their SHA-256 hashes are stored. The link expires at
the earlier of `INVITATION_TOKEN_TTL_DAYS` or the meeting request response deadline. Meeting
confirmation, material update, and cancellation emails include a `meeting.ics` calendar event plus
the meeting description as a Markdown agenda. Markdown raw HTML is disabled.

Calendar events use the meeting UUID as a stable UID. New meetings start at `calendarSequence=0`.
Changes to title, description, start/end, timezone, or location increment the sequence and send
`METHOD:REQUEST`; cancellation increments it and sends `METHOD:CANCEL`. Same-value changes,
tag-only changes, completion, and archival do not send calendar updates. Each recipient receives a
recipient-specific ICS without other attendee email addresses. Delivery is best-effort after the
database write and does not roll back a meeting when an email provider fails.

## Health Endpoints

| Endpoint        | Purpose                                            |
| --------------- | -------------------------------------------------- |
| `/health/live`  | Returns process liveness and uptime                |
| `/health/ready` | Verifies PostgreSQL, Redis, and MinIO connectivity |
| `/health`       | Returns readiness status plus uptime               |

`/health` and `/health/ready` return `503` when a dependency is unreachable or misconfigured.

## API Endpoints

All `/api/*` routes require a JWT bearer token except the auth endpoints and `/api/public/invitations/*`. Public invitation routes require the random token delivered by email. Obtain a user token from register or login and send it as `Authorization: Bearer <token>` for protected routes.

### Auth (`/api/auth`)

| Method | Path        | Body                        | Returns                          |
| ------ | ----------- | --------------------------- | -------------------------------- |
| POST   | `/register` | `{ name, email, password }` | `201 { token, user }`            |
| POST   | `/login`    | `{ email, password }`       | `200 { token, user }`            |
| GET    | `/me`       | —                           | `200 { user }` for current token |

### Meetings (`/api/meetings`)

| Method | Path   | Body / Query                                                                             | Returns                                               |
| ------ | ------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| POST   | `/`    | `{ title, description?, startsAt, endsAt, ownerId?, timezoneName?, location?, status? }` | `201 { meeting }`                                     |
| GET    | `/`    | `?page=&limit=&from=&to=&status=&q=`                                                     | `200 { meetings }` + `Link` & `X-Total-Count` headers |
| GET    | `/:id` | —                                                                                        | `200 { meeting }` or `404`                            |
| PUT    | `/:id` | partial subset of POST body fields                                                       | `200 { meeting }` or `404`                            |
| DELETE | `/:id` | —                                                                                        | `204` or `404`                                        |

Datetime fields (`startsAt`, `endsAt`) accept ISO 8601 strings with offset (e.g. `2026-05-01T09:00:00+10:00`); Postgres stores them as UTC. `timezoneName` is an IANA zone name (default `'UTC'`) preserved verbatim for client-side display. Allowed `status` values: `scheduled`, `completed`, `cancelled`, `archived`.

Meeting responses include immutable `ownerId` and audit-only `createdBy`, plus `tagId`, `tag`, `calendarSequence`, `fileCount`, `fileNames`, `participantCount`, and `participantNames`. `ownerId` defaults to the caller for backwards compatibility. The creator and owner are both added as organizers when they differ. `calendarSequence` is the persistent revision used by calendar clients to apply ICS updates and cancellations. `fileCount` is the number of uploaded files attached to that meeting, while `fileNames` lists the uploaded filenames for repository search/display. `participantCount` is the full attendee count, while `participantNames` is a short preview of up to three names for repository/list views.

`GET /api/meetings/:id` is available only to the meeting owner or meeting participants. Non-participants receive `403`, matching meeting file access rules.

`POST /api/meetings` sends a best-effort calendar email to the organizer. `PUT /api/meetings/:id`
is restricted to the meeting owner or an organizer and sends material calendar updates to
registered participants plus emailed external invitees linked through a confirmed meeting request.
`DELETE /api/meetings/:id` is restricted to the meeting owner or an organizer.

**Status workflow.** `PUT /api/meetings/:id` enforces forward-only transitions on `status`:

```
scheduled ──▶ completed ──▶ archived
    │                         ▲
    └──────▶ cancelled ───────┘
```

Updating `status` to the same value is a no-op. `archived` is terminal. Any other transition returns `400` with `Invalid status transition: <from> → <to>`.

`GET /api/meetings` paginates via [RFC 5988 `Link` headers](https://www.rfc-editor.org/rfc/rfc5988) (`first`, `last`, `prev`, `next`) plus `X-Total-Count`. Page defaults: `page=1`, `limit=20` (max `100`). All filter query params are preserved across `Link` URLs.

**Search.** The `q` query param runs Postgres full-text search against `title` + `description` (`english` config) and uploaded meeting file names (`simple` config). Both are backed by GIN inverted indexes. Stemming applies to meeting text (e.g., `q=plan` matches "planning"); file names are tokenized without language stemming. Multi-word text queries are AND-ed. Max 200 chars. Composes with every other filter. Example: `GET /api/meetings?q=budget&status=scheduled`.

### Meeting Requests (`/api/meeting-requests`)

Meeting requests support the scheduling flow before a confirmed meeting exists. Confirmed meetings still live in `/api/meetings`.

| Method | Path                                           | Body / Query                                                                                | Returns                                                   |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| POST   | `/`                                            | `{ title, tag, responseDeadline, ownerId?, description?, durationMinutes?, timezoneName? }` | `201 { meetingRequest }`                                  |
| GET    | `/:requestId`                                  | —                                                                                           | `200 { meetingRequest, timeOptions, invitees }`           |
| PUT    | `/:requestId`                                  | `{ title, tag, responseDeadline, description?, durationMinutes?, timezoneName? }`           | `200 { meetingRequest }`                                  |
| GET    | `/:requestId/invitees/:inviteeId`              | —                                                                                           | `200 { meetingRequest, invitee, timeOptions, responses }` |
| PUT    | `/:requestId/time-options`                     | `{ timeOptions: [{ startsAt, endsAt, sortOrder? }] }`                                       | `200 { timeOptions }`                                     |
| PUT    | `/:requestId/invitees`                         | `{ invitees: [{ email, name? }] }`                                                          | `200 { invitees }`                                        |
| POST   | `/:requestId/send-invitations`                 | —                                                                                           | `200 { sentCount }`                                       |
| PUT    | `/:requestId/invitees/:inviteeId/availability` | `{ responses: [{ timeOptionId, isAvailable }] }`                                            | `200 { responses }`                                       |
| POST   | `/:requestId/confirm`                          | `{ timeOptionId, location?, tag? }`                                                         | `201 { meeting, meetingRequest, emailDelivery }`          |
| DELETE | `/:requestId`                                  | —                                                                                           | `200 { meetingRequest }`                                  |

Allowed request `status` values: `draft`, `collecting_availability`, `ready_to_confirm`, `confirmed`, `cancelled`.

Meeting request responses include immutable `ownerId` plus derived `responseDeadlinePassed`, `availabilityClosed`, and `canConfirm` flags. `ownerId` must identify a registered user and defaults to the caller for backwards compatibility. A distinct owner is automatically retained in the invitee list and becomes an organizer with the request creator when the meeting is confirmed. `responseDeadline` is required when creating a meeting request. It closes invitee availability submission and updates, but does not cancel the request. The deadline must be strictly earlier than every candidate time option; updating it to the same time as or later than an existing candidate returns `400`. The request creator can confirm a final meeting time from the existing time options at any point after invitations are sent, including before all invitees respond. Confirming early closes the request and any outstanding availability voting.

Time options are scoped to a meeting request. The same wall-clock time offered in two different requests is stored as two different `meeting_time_options` rows, because selection state and availability counts belong to that request. Every time option must start strictly after the response deadline; earlier or equal starts return `400`. Time options cannot overlap with the request creator's existing non-cancelled/non-archived meetings; conflicts return `409`. Availability is binary: `isAvailable=true` or `false`; missing response rows mean the invitee has not responded yet. Availability submission after the response deadline returns `409`. The invitee detail endpoint is safe for the matching invitee or the request creator and returns only that invitee's response rows, not the full invitee list.

`POST /:requestId/send-invitations` requires the request creator and sends one tokenized link per invitee after time options and invitees have been saved. Sending again rotates the invitation tokens. Email provider errors leave the meeting request intact so delivery can be retried. Confirming the final meeting sends a best-effort confirmation email with a sequence-zero ICS to the organizer and invitees whose invitations were delivered, and returns `{ emailDelivery: { sentCount, failedCount } }`; confirmation is not rolled back if an email fails. Terminating a confirmed request sends a calendar cancellation.

### Public Invitations (`/api/public/invitations`)

| Method | Path                   | Body                                             | Returns                                                   |
| ------ | ---------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| GET    | `/:token`              | —                                                | `200 { meetingRequest, invitee, timeOptions, responses }` |
| PUT    | `/:token/availability` | `{ responses: [{ timeOptionId, isAvailable }] }` | `200 { responses }`                                       |

These endpoints do not require a user account. Invalid or expired tokens return `404`; closed requests and passed response deadlines return `409` when availability is submitted.

### Dashboard (`/api/dashboard`)

| Method | Path                          | Body / Query      | Returns                                                                                      |
| ------ | ----------------------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| GET    | `/`                           | —                 | `200 { recentMeetings, pendingMeetingRequests, pendingAvailabilityRequests, myActionItems }` |
| GET    | `/notifications/summary`      | —                 | `200 { unreadCount, notifications, nextCursor }`                                             |
| GET    | `/notifications`              | `?limit=&cursor=` | `200 { notifications, nextCursor }`                                                          |
| POST   | `/notifications/:id/read`     | —                 | `200 { notification }`                                                                       |
| POST   | `/notifications/:id/archive`  | —                 | `200 { notification }`                                                                       |
| POST   | `/notifications/read`         | `{ ids: uuid[] }` | `200 { updatedCount }`                                                                       |
| POST   | `/notifications/read-all`     | —                 | `200 { updatedCount }`                                                                       |
| POST   | `/notifications/archive-read` | —                 | `200 { archivedCount }`                                                                      |

`recentMeetings` contains the next six accessible active meetings ordered by earliest `startsAt`. Cancelled, archived, and past meetings are excluded.

`pendingMeetingRequests` contains unconfirmed, uncancelled meeting requests created by the current user. Each item includes `inviteeCounts`, `timeOptionCount`, `durationMinutes`, `timezoneName`, `responseDeadline`, `status`, and derived deadline flags so the dashboard can show in-progress meeting polls before a real meeting exists.

`pendingAvailabilityRequests` contains unconfirmed, uncancelled meeting requests where the current user is an invitee, has not submitted availability yet, and the response deadline has not passed. Each item includes the `inviteeId`, creator summary, invitee counts, time option count, duration, timezone, deadline, status, and derived deadline flags so the dashboard can open the voting modal.

`myActionItems` contains the current user's open assigned action items. Each item is a lean dashboard summary with `id`, `title`, `meetingId`, `meetingTitle`, `assigneeId`, `status`, `isOverdue`, `dueState`, `priority`, `dueDate`, and `createdAt`. Fetch `/api/action-items/:id` for detail-only fields such as `description`, `updatedAt`, and `completedAt`.

Notifications are table-backed lifecycle records. New rows are created for meeting creation, action-item assignment, meeting-request invitations, and meeting-request confirmation. Each notification stores `entityType` and `entityId` for navigation plus snapshot `title` and `detail` for fast feed rendering. `unreadCount` counts rows where `readAt` is null. Archived notifications are hidden from summary and feed responses. `/notifications/summary` is intended for the topbar. It returns the latest five notifications and `nextCursor` when more items exist. `/notifications` supports cursor pagination for full notification feeds. `limit` defaults to 20 and is capped at 50. Pass the returned `nextCursor` to fetch the next page.

### Meeting Minutes (`/api/meetings/:meetingId/minutes`)

| Method | Path          | Body / Query                                                                                                           | Returns                    |
| ------ | ------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| GET    | `/`           | —                                                                                                                      | `200 { minutes }`          |
| PUT    | `/`           | partial: `{ content?, keyDiscussions?, decisions?, facilitatorId?, recorderId?, generatedFromTranscriptId?, status? }` | `200 { minutes }`          |
| PUT    | `/:minutesId` | same as above                                                                                                          | `200 { minutes }` or `404` |

`GET` eagerly creates an empty draft minutes row if the meeting does not have one yet. `content`, `keyDiscussions`, and `decisions` live on `minutes`, not `meetings`. `facilitatorId`, `recorderId`, and `generatedFromTranscriptId` are nullable UUID references. Allowed minutes `status` values: `draft`, `approved`, `published`.

Any meeting participant can read minutes. Only the meeting owner or a participant with `role='organizer'` can update minutes.

### Meeting Recording (`/api/meetings/:meetingId/recording`)

Meeting recordings are the dedicated audio source for transcript/minutes generation. Regular meeting materials may also include audio files, but those files do not automatically become the generation source.

| Method | Path                | Body / Query                                            | Returns                                           |
| ------ | ------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| GET    | `/`                 | —                                                       | `200 { recording, transcript, analysisRun }`      |
| PUT    | `/`                 | `multipart/form-data`: field `file`, optional `replace` | `201 { recording, transcript, analysisRun }`      |
| DELETE | `/`                 | —                                                       | `204`                                             |
| POST   | `/generate-minutes` | —                                                       | `202 { recording, transcript, generationStatus }` |

Any meeting participant can read recording metadata, transcript status, and analysis-run status. Only the meeting owner or an organizer can manage recordings. The API allows one active recording per meeting. Uploading a second recording without `replace=true` returns `409`; replacing archives the old recording and removes its object. Recordings are stored in the `meeting-audio` bucket with keys shaped as `meetings/{meetingId}/recordings/{recordingId}`.

When `AI_PIPELINE_ENABLED=true`, recording upload transactionally creates a `processing` transcript, a `queued` analysis run, and a durable `recording.uploaded` outbox event. The background outbox dispatcher publishes an idempotent BullMQ flow with a transcription child job and an analysis parent job; job payloads contain identifiers only. PostgreSQL statuses are the user-visible source of truth. When the pipeline is disabled, upload remains metadata-only and returns `transcript: null` and `analysisRun: null`.

`POST /generate-minutes` is currently a scaffold: because no speech-to-text/LLM provider is configured, it creates a failed transcript with `generationStatus='not_configured'`. This preserves the workflow shape without generating fake minutes.

### Meeting Participants (`/api/meetings/:meetingId/participants`)

| Method | Path       | Body / Query                   | Returns                |
| ------ | ---------- | ------------------------------ | ---------------------- |
| GET    | `/`        | —                              | `200 { participants }` |
| POST   | `/`        | `{ userIds: string[], role? }` | `201 { participants }` |
| PATCH  | `/:userId` | `{ role }`                     | `200 { participant }`  |
| DELETE | `/:userId` | —                              | `204`                  |

Allowed `role` values: `organizer`, `attendee`, `optional` (default `attendee`).

`POST` is idempotent — re-adding an existing participant is a no-op (use `PATCH` to change role).
Only the meeting owner or a participant with `role='organizer'` can add, update, or remove participants. The last organizer cannot be demoted or removed, and the immutable owner cannot be removed or downgraded. Participant details are visible only to the owner and meeting participants.

`GET /api/meetings/:id` now includes a `participants` array alongside the meeting.

### Meeting Files (`/api/meetings/:meetingId/files` and `/api/files`)

| Method | Path                         | Body / Query                                                | Returns                  |
| ------ | ---------------------------- | ----------------------------------------------------------- | ------------------------ |
| POST   | `/meetings/:meetingId/files` | `multipart/form-data`: field `file`, optional `description` | `201 { file }`           |
| GET    | `/meetings/:meetingId/files` | —                                                           | `200 { files }`          |
| GET    | `/files/:id/download`        | —                                                           | `200 { url, expiresAt }` |
| DELETE | `/files/:id`                 | —                                                           | `204`                    |

Upload accepts PDF, DOCX, XLSX, PPTX, PNG, JPEG, GIF, WEBP, TXT, Markdown, and audio files up to **50 MB**. Larger files return `413`; unsupported MIME types return `415`. Regular files are stored in the `meeting-files` bucket with object keys shaped as `meetings/{meetingId}/files/{fileId}`. Audio uploads should send `storageKind=audio`; they are stored in the `meeting-audio` bucket with keys shaped as `meetings/{meetingId}/audio/{fileId}`.

Download returns a short-lived (60 s) MinIO presigned GET URL. The client fetches the file directly from MinIO using that URL.

Any meeting participant (including the owner or any participant role) can upload, list, and request download URLs. Only the meeting owner or a participant with `role='organizer'` can delete files. Non-participants receive `403`.

### Action Items (`/api/meetings/:meetingId/action-items` and `/api/action-items`)

| Method | Path                                | Body / Query                                                                                  | Returns               |
| ------ | ----------------------------------- | --------------------------------------------------------------------------------------------- | --------------------- |
| POST   | `/meetings/:meetingId/action-items` | `{ title, description?, assigneeId?, dueDate?, priority? }`                                   | `201 { actionItem }`  |
| GET    | `/meetings/:meetingId/action-items` | `?status=...&assigneeId=...` (both optional)                                                  | `200 { actionItems }` |
| GET    | `/action-items`                     | `?scope=mine\|owned&status=...&priority=...`                                                  | `200 { actionItems }` |
| GET    | `/action-items/:id`                 | —                                                                                             | `200 { actionItem }`  |
| PUT    | `/action-items/:id`                 | partial: `{ title?, description?, assigneeId?, dueDate?, status?, priority? }` (at least one) | `200 { actionItem }`  |
| DELETE | `/action-items/:id`                 | —                                                                                             | `204`                 |

- `status` — one of `todo` (default), `in_progress`, `completed`, `cancelled`. Transitioning to `completed` stamps `completedAt`; moving away clears it.
- `isOverdue` and `dueState` are derived from `dueDate` and workflow `status`; they are not persisted statuses. `dueState` is one of `none`, `upcoming`, `overdue`, or `closed`.
- `priority` — one of `low`, `medium` (default), `high`.
- Any meeting participant (including the owner) can create, read, update, or delete action items. An assigned user can update their own item status even if older data does not include them as a meeting participant. Other non-participants receive `403`.
- `/action-items` defaults to `scope=mine`, which returns only items assigned to the caller. `scope=owned` returns every item attached to meetings whose `ownerId` is the caller, including items assigned to others and unassigned items.
- Each item also carries `source` (`manual` default, or `ai` for AI-extracted items) and an optional `sourceRef` for linking back to transcript/minute context.

A Postman collection covering every endpoint (with auto-token capture) is at [`docs/postman/dost-meeting-mgnt.postman_collection.json`](../docs/postman/dost-meeting-mgnt.postman_collection.json).
