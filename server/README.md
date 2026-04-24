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
| GET    | `/`     | `?page=&limit=&from=&to=&status=&department=`                                            | `200 { meetings }` + `Link` & `X-Total-Count` headers  |
| GET    | `/:id`  | —                                                                                        | `200 { meeting }` or `404`                             |
| PUT    | `/:id`  | partial subset of POST body fields                                                       | `200 { meeting }` or `404`                             |
| DELETE | `/:id`  | —                                                                                        | `204` or `404`                                         |

Datetime fields (`startsAt`, `endsAt`) accept ISO 8601 strings with offset (e.g. `2026-05-01T09:00:00+10:00`); Postgres stores them as UTC. `timezoneName` is an IANA zone name (default `'UTC'`) preserved verbatim for client-side display. Allowed `status` values: `scheduled`, `in_progress`, `completed`, `cancelled`.

`GET /api/meetings` paginates via [RFC 5988 `Link` headers](https://www.rfc-editor.org/rfc/rfc5988) (`first`, `last`, `prev`, `next`) plus `X-Total-Count`. Page defaults: `page=1`, `limit=20` (max `100`). All filter query params are preserved across `Link` URLs.

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

Upload accepts PDF, DOCX, XLSX, PPTX, PNG, JPEG, GIF, and WEBP files up to **50 MB**. Larger files return `413`; unsupported MIME types return `415`.

Download returns a short-lived (60 s) MinIO presigned GET URL. The client fetches the file directly from MinIO using that URL.

Any meeting participant (creator or any role) can upload, list, and request download URLs. Only the meeting creator or a participant with `role='organizer'` can delete files. Non-participants receive `403`.

### RSVP (self-service)

| Method | Path                    | Body                    | Returns                |
| ------ | ----------------------- | ----------------------- | ---------------------- |
| PUT    | `/meetings/:id/rsvp`    | `{ rsvpStatus }`        | `200 { participant }`  |

Participants update their own attendance response. Allowed `rsvpStatus`: `accepted`, `declined` (self-reset to `pending` is not allowed — it's the system-assigned initial state). Non-participants receive 403.

`GET /api/meetings/:id` now also returns an `rsvpCounts` object: `{ accepted, declined, pending }` computed from the meeting's participants.

A Postman collection covering every endpoint (with auto-token capture) is at [`docs/postman/dost-meeting-mgnt.postman_collection.json`](../docs/postman/dost-meeting-mgnt.postman_collection.json).
