Express API for DOST Meeting Management System.

## Run

Start the API with `npm run dev --workspace=server`.

The default port is `3001`, configurable through `PORT` in `.env`.

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

| Method | Path        | Body                          | Returns                           |
| ------ | ----------- | ----------------------------- | --------------------------------- |
| POST   | `/register` | `{ name, email, password }`   | `201 { token, user }`             |
| POST   | `/login`    | `{ email, password }`         | `200 { token, user }`             |
| GET    | `/me`       | —                             | `200 { user }` for current token  |

### Meetings (`/api/meetings`)

| Method | Path    | Body / Query                                                                             | Returns                                                |
| ------ | ------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| POST   | `/`     | `{ title, description?, startsAt, endsAt, timezoneName?, location?, status?, department? }` | `201 { meeting }`                                      |
| GET    | `/`     | `?page=&limit=&from=&to=&status=&department=&q=`                                         | `200 { meetings }` + `Link` & `X-Total-Count` headers  |
| GET    | `/:id`  | —                                                                                        | `200 { meeting }` or `404`                             |
| PUT    | `/:id`  | partial subset of POST body fields                                                       | `200 { meeting }` or `404`                             |
| DELETE | `/:id`  | —                                                                                        | `204` or `404`                                         |

Datetime fields (`startsAt`, `endsAt`) accept ISO 8601 strings with offset (e.g. `2026-05-01T09:00:00+10:00`); Postgres stores them as UTC. `timezoneName` is an IANA zone name (default `'UTC'`) preserved verbatim for client-side display. Allowed `status` values: `scheduled`, `in_progress`, `completed`, `cancelled`, `archived`.

**Status workflow.** `PUT /api/meetings/:id` enforces forward-only transitions on `status`:

```
scheduled ──▶ in_progress ──▶ completed ──▶ archived
    │               │                           ▲
    └──────────────▶└───▶ cancelled ────────────┘
```

Updating `status` to the same value is a no-op. `archived` is terminal. Any other transition returns `400` with `Invalid status transition: <from> → <to>`.

`GET /api/meetings` paginates via [RFC 5988 `Link` headers](https://www.rfc-editor.org/rfc/rfc5988) (`first`, `last`, `prev`, `next`) plus `X-Total-Count`. Page defaults: `page=1`, `limit=20` (max `100`). All filter query params are preserved across `Link` URLs.

**Full-text search.** The `q` query param runs a Postgres full-text match (`plainto_tsquery` / `english` config) against `title` + `description`. Stemming applies (e.g., `q=plan` matches "planning"); multi-word queries are AND-ed. Max 200 chars. Composes with every other filter. Example: `GET /api/meetings?q=budget&status=scheduled&department=finance`.

### Meeting Participants (`/api/meetings/:meetingId/participants`)

| Method | Path         | Body / Query                                         | Returns                    |
| ------ | ------------ | ---------------------------------------------------- | -------------------------- |
| GET    | `/`          | —                                                    | `200 { participants }`     |
| POST   | `/`          | `{ userIds: string[], role? }`                       | `201 { participants }`     |
| PATCH  | `/:userId`   | `{ role?, rsvpStatus? }` (at least one required)     | `200 { participant }`      |
| DELETE | `/:userId`   | —                                                    | `204`                      |

Allowed `role` values: `organizer`, `attendee`, `optional` (default `attendee`).
Allowed `rsvpStatus` values: `pending`, `accepted`, `declined` (default `pending`).

`POST` is idempotent — re-adding an existing participant is a no-op (use `PATCH` to change role).
Only the meeting creator or a participant with `role='organizer'` can add, update, or remove participants. The last organizer cannot be demoted or removed.

`GET /api/meetings/:id` now includes a `participants` array alongside the meeting.

### Meeting Files (`/api/meetings/:meetingId/files` and `/api/files`)

| Method | Path                            | Body / Query                                      | Returns                      |
| ------ | ------------------------------- | ------------------------------------------------- | ---------------------------- |
| POST   | `/meetings/:meetingId/files`    | `multipart/form-data`: field `file`, optional `description` | `201 { file }`   |
| GET    | `/meetings/:meetingId/files`    | —                                                 | `200 { files }`              |
| GET    | `/files/:id/download`           | —                                                 | `200 { url, expiresAt }`     |
| DELETE | `/files/:id`                    | —                                                 | `204`                        |

Upload accepts PDF, DOCX, XLSX, PPTX, PNG, JPEG, GIF, WEBP, TXT, and Markdown files up to **50 MB**. Larger files return `413`; unsupported MIME types return `415`.

Download returns a short-lived (60 s) MinIO presigned GET URL. The client fetches the file directly from MinIO using that URL.

Any meeting participant (creator or any role) can upload, list, and request download URLs. Only the meeting creator or a participant with `role='organizer'` can delete files. Non-participants receive `403`.

### RSVP (self-service)

| Method | Path                    | Body                    | Returns                |
| ------ | ----------------------- | ----------------------- | ---------------------- |
| PUT    | `/meetings/:id/rsvp`    | `{ rsvpStatus }`        | `200 { participant }`  |

Participants update their own attendance response. Allowed `rsvpStatus`: `accepted`, `declined` (self-reset to `pending` is not allowed — it's the system-assigned initial state). Non-participants receive 403.

`GET /api/meetings/:id` now also returns an `rsvpCounts` object: `{ accepted, declined, pending }` computed from the meeting's participants.

### Action Items (`/api/meetings/:meetingId/action-items` and `/api/action-items`)

| Method | Path                                    | Body / Query                                                                                         | Returns                |
| ------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------- |
| POST   | `/meetings/:meetingId/action-items`     | `{ title, description?, assigneeId?, dueDate?, priority? }`                                          | `201 { actionItem }`   |
| GET    | `/meetings/:meetingId/action-items`     | `?status=...&assigneeId=...` (both optional)                                                         | `200 { actionItems }`  |
| PUT    | `/action-items/:id`                     | partial: `{ title?, description?, assigneeId?, dueDate?, status?, priority? }` (at least one)        | `200 { actionItem }`   |
| DELETE | `/action-items/:id`                     | —                                                                                                    | `204`                  |

- `status` — one of `todo` (default), `in_progress`, `blocked`, `completed`, `cancelled`. Transitioning to `completed` stamps `completedAt`; moving away clears it.
- `priority` — one of `low`, `medium` (default), `high`.
- Any meeting participant (including the creator) can create, read, update, or delete action items. Non-participants receive `403`.
- Each item also carries `source` (`manual` default, or `ai` for AI-extracted items) and an optional `sourceRef` for linking back to transcript/minute context.

### Minutes (`/api/meetings/:meetingId/minutes` and `/api/minutes`)

| Method | Path                                | Body / Query        | Returns           |
| ------ | ----------------------------------- | ------------------- | ----------------- |
| GET    | `/meetings/:meetingId/minutes`      | —                   | `200 { minutes }` |
| PUT    | `/minutes/:id`                      | `{ body: string }`  | `200 { minutes }` |

- 1:1 with meetings — every meeting gets a minutes row created automatically when the meeting is created (seeded with a default markdown template covering Attendees / Agenda / Discussion / Decisions / Action Items). There is no `POST` endpoint.
- `body` is markdown text capped at 256 KB (UTF-8). Larger payloads return `413` — attach transcript-sized content as a file instead.
- Every successful `PUT` writes a full snapshot to `minutes_versions` with a per-minutes monotonically incrementing `version`. Read-side endpoint for version history is tracked separately.
- Any meeting participant (including the creator) can read or edit minutes. Non-participants receive `403`. Edits are blocked (`403`) when the parent meeting is `archived`; reads remain allowed.
- Concurrency is last-write-wins; recovery is via the version table.
- Embedded images use the existing files API: upload via `POST /api/meetings/:id/files`, then reference `![alt](/api/files/:fileId/download)` in the body.

A Postman collection covering every endpoint (with auto-token capture) is at [`docs/postman/dost-meeting-mgnt.postman_collection.json`](../docs/postman/dost-meeting-mgnt.postman_collection.json).
