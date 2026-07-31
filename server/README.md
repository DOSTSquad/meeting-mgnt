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

## Health Endpoints

| Endpoint        | Purpose                                            |
| --------------- | -------------------------------------------------- |
| `/health/live`  | Returns process liveness and uptime                |
| `/health/ready` | Verifies PostgreSQL, Redis, and MinIO connectivity |
| `/health`       | Returns readiness status plus uptime               |

`/health` and `/health/ready` return `503` when a dependency is unreachable or misconfigured.

## API Endpoints

All `/api/*` routes require a JWT bearer token except `POST /api/auth/register` and `POST /api/auth/login`. Obtain a token from register or login and send it as `Authorization: Bearer <token>`.

### Auth (`/api/auth`)

| Method | Path        | Body                        | Returns                          |
| ------ | ----------- | --------------------------- | -------------------------------- |
| POST   | `/register` | `{ name, email, password }` | `201 { token, user }`            |
| POST   | `/login`    | `{ email, password }`       | `200 { token, user }`            |
| GET    | `/me`       | —                           | `200 { user }` for current token |

### Meetings (`/api/meetings`)

| Method | Path   | Body / Query                                                                   | Returns                                               |
| ------ | ------ | ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| POST   | `/`    | `{ title, description?, startsAt, endsAt, timezoneName?, location?, status? }` | `201 { meeting }`                                     |
| GET    | `/`    | `?page=&limit=&from=&to=&status=&q=`                                           | `200 { meetings }` + `Link` & `X-Total-Count` headers |
| GET    | `/:id` | —                                                                              | `200 { meeting }` or `404`                            |
| PUT    | `/:id` | partial subset of POST body fields                                             | `200 { meeting }` or `404`                            |
| DELETE | `/:id` | —                                                                              | `204` or `404`                                        |

Datetime fields (`startsAt`, `endsAt`) accept ISO 8601 strings with offset (e.g. `2026-05-01T09:00:00+10:00`); Postgres stores them as UTC. `timezoneName` is an IANA zone name (default `'UTC'`) preserved verbatim for client-side display. Allowed `status` values: `scheduled`, `completed`, `cancelled`, `archived`.

Meeting responses include `tagId`, `tag`, `fileCount`, `fileNames`, `participantCount`, and `participantNames`. `fileCount` is the number of uploaded files attached to that meeting, while `fileNames` lists the uploaded filenames for repository search/display. `participantCount` is the full attendee count, while `participantNames` is a short preview of up to three names for repository/list views.

`GET /api/meetings/:id` is available only to the meeting creator or meeting participants. Non-participants receive `403`, matching meeting file access rules.

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

| Method | Path                                           | Body / Query                                                                      | Returns                                                   |
| ------ | ---------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------- |
| POST   | `/`                                            | `{ title, tag, responseDeadline, description?, durationMinutes?, timezoneName? }` | `201 { meetingRequest }`                                  |
| GET    | `/:requestId`                                  | —                                                                                 | `200 { meetingRequest, timeOptions, invitees }`           |
| PUT    | `/:requestId`                                  | `{ title, tag, responseDeadline, description?, durationMinutes?, timezoneName? }` | `200 { meetingRequest }`                                  |
| GET    | `/:requestId/invitees/:inviteeId`              | —                                                                                 | `200 { meetingRequest, invitee, timeOptions, responses }` |
| PUT    | `/:requestId/time-options`                     | `{ timeOptions: [{ startsAt, endsAt, sortOrder? }] }`                             | `200 { timeOptions }`                                     |
| PUT    | `/:requestId/invitees`                         | `{ invitees: [{ email, name? }] }`                                                | `200 { invitees }`                                        |
| PUT    | `/:requestId/invitees/:inviteeId/availability` | `{ responses: [{ timeOptionId, isAvailable }] }`                                  | `200 { responses }`                                       |
| POST   | `/:requestId/confirm`                          | `{ timeOptionId, location?, tag? }`                                               | `201 { meeting, meetingRequest }`                         |
| DELETE | `/:requestId`                                  | —                                                                                 | `200 { meetingRequest }`                                  |

Allowed request `status` values: `draft`, `collecting_availability`, `ready_to_confirm`, `confirmed`, `cancelled`.

Meeting request responses include derived `responseDeadlinePassed`, `availabilityClosed`, and `canConfirm` flags. `responseDeadline` is required when creating a meeting request. It closes invitee availability submission and updates, but does not cancel the request. Once the deadline has passed, the organizer can confirm a final meeting time from the existing time options even if some invitees never responded.

Time options are scoped to a meeting request. The same wall-clock time offered in two different requests is stored as two different `meeting_time_options` rows, because selection state and availability counts belong to that request. Time options cannot overlap with the request creator's existing non-cancelled/non-archived meetings; conflicts return `409`. Availability is binary: `isAvailable=true` or `false`; missing response rows mean the invitee has not responded yet. Availability submission after the response deadline returns `409`. The invitee detail endpoint is safe for the matching invitee or the request creator and returns only that invitee's response rows, not the full invitee list.

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

Any meeting participant can read minutes. Only the meeting creator or a participant with `role='organizer'` can update minutes.

### Meeting Recording (`/api/meetings/:meetingId/recording`)

Meeting recordings are the dedicated audio source for transcript/minutes generation. Regular meeting materials may also include audio files, but those files do not automatically become the generation source.

| Method | Path                | Body / Query                                            | Returns                                           |
| ------ | ------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| GET    | `/`                 | —                                                       | `200 { recording, transcript }`                   |
| PUT    | `/`                 | `multipart/form-data`: field `file`, optional `replace` | `201 { recording, transcript }`                   |
| DELETE | `/`                 | —                                                       | `204`                                             |
| POST   | `/generate-minutes` | —                                                       | `202 { recording, transcript, generationStatus }` |

Any meeting participant can read recording metadata and transcript status. Only the meeting creator or an organizer can manage recordings. The API allows one active recording per meeting. Uploading a second recording without `replace=true` returns `409`; replacing archives the old recording and removes its object. Recordings are stored in the `meeting-audio` bucket with keys shaped as `meetings/{meetingId}/recordings/{recordingId}`.

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
Only the meeting creator or a participant with `role='organizer'` can add, update, or remove participants. The last organizer cannot be demoted or removed.

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

Any meeting participant (creator or any role) can upload, list, and request download URLs. Only the meeting creator or a participant with `role='organizer'` can delete files. Non-participants receive `403`.

### Action Items (`/api/meetings/:meetingId/action-items` and `/api/action-items`)

| Method | Path                                | Body / Query                                                                                  | Returns               |
| ------ | ----------------------------------- | --------------------------------------------------------------------------------------------- | --------------------- |
| POST   | `/meetings/:meetingId/action-items` | `{ title, description?, assigneeId?, dueDate?, priority? }`                                   | `201 { actionItem }`  |
| GET    | `/meetings/:meetingId/action-items` | `?status=...&assigneeId=...` (both optional)                                                  | `200 { actionItems }` |
| GET    | `/action-items/:id`                 | —                                                                                             | `200 { actionItem }`  |
| PUT    | `/action-items/:id`                 | partial: `{ title?, description?, assigneeId?, dueDate?, status?, priority? }` (at least one) | `200 { actionItem }`  |
| DELETE | `/action-items/:id`                 | —                                                                                             | `204`                 |

- `status` — one of `todo` (default), `in_progress`, `completed`, `cancelled`. Transitioning to `completed` stamps `completedAt`; moving away clears it.
- `isOverdue` and `dueState` are derived from `dueDate` and workflow `status`; they are not persisted statuses. `dueState` is one of `none`, `upcoming`, `overdue`, or `closed`.
- `priority` — one of `low`, `medium` (default), `high`.
- Any meeting participant (including the creator) can create, read, update, or delete action items. An assigned user can update their own item status even if older data does not include them as a meeting participant. Other non-participants receive `403`.
- Each item also carries `source` (`manual` default, or `ai` for AI-extracted items) and an optional `sourceRef` for linking back to transcript/minute context.

A Postman collection covering every endpoint (with auto-token capture) is at [`docs/postman/dost-meeting-mgnt.postman_collection.json`](../docs/postman/dost-meeting-mgnt.postman_collection.json).
