# DOST Meeting Management

Meeting Management is a workspace app for creating meeting scheduling requests, collecting participant availability, confirming meetings, managing meeting files, tracking action items, and maintaining dedicated meeting minutes.

The app is a local-first monorepo used for the IFN735/DOST meeting management project.

## Structure

```
meeting-mgnt/
├── client/                  # Vite + React + Tailwind front-end
├── server/                  # Node.js + Express API
│   ├── db/migrations/       # versioned SQL migrations
│   └── scripts/             # migrate/seed scripts
├── docs/postman/            # importable API collection
├── designs/                 # Pencil design files
├── docker-compose.yml       # local PostgreSQL, Redis, MinIO
└── package.json             # npm workspace root
```

The root `package.json` declares `client` and `server` as npm workspaces.

## Setup

1. Copy `.env.example` to `.env`.
2. Run `npm install` from the repo root.
3. Start local infra with `docker compose up -d`.
4. Apply database migrations with `npm run migrate --workspace=server`.
5. Optional: seed local demo data with `npm run seed --workspace=server`.
6. Start the API with `npm run dev --workspace=server`.
7. Start the client with `npm run dev --workspace=client`.

The Compose stack starts PostgreSQL 16, Redis 7, MinIO, and a one-shot `minio-init` sidecar. PostgreSQL also mounts [`scripts/postgres-init.sql`](/Users/jhowliu/Developer/ifn735/meeting-mgnt/scripts/postgres-init.sql) on first boot to enable the `pgcrypto` and `uuid-ossp` extensions.

The server defaults to port `3001`. The Vite client uses the normal Vite dev port and reads `VITE_*` environment variables only.

## Database Migrations

Run server migrations with:

`npm run migrate --workspace=server`

Migrations are SQL files in `server/db/migrations`, tracked in the `schema_migrations` table.

## Common Commands

| Task                       | Command                              |
| -------------------------- | ------------------------------------ |
| Lint all workspaces        | `npm run lint`                       |
| Test all workspaces        | `npm run test`                       |
| Format check               | `npm run format`                     |
| Format write               | `npm run format:fix`                 |
| Run server                 | `npm run dev --workspace=server`     |
| Run client                 | `npm run dev --workspace=client`     |
| Run server tests (Jest)    | `npm run test --workspace=server`    |
| Run DB-backed server tests | `npm run test:db --workspace=server` |
| Run server migrations      | `npm run migrate --workspace=server` |
| Seed local demo data       | `npm run seed --workspace=server`    |
| Build client               | `npm run build --workspace=client`   |

## Current Product Surface

### Client

The React client currently includes:

- Email-only authentication.
- Dashboard with upcoming meetings, pending host-created meeting requests, invitee availability requests, action items, and notification dropdown.
- Five-step create meeting flow:
  1. Create request metadata.
  2. Add candidate time options.
  3. Invite participants by email/user.
  4. Review availability responses.
  5. Confirm the final meeting.
- Invitee availability voting modal from the dashboard.
- Meeting Repository route at `/meetings`, organized by meeting tags with a scannable meetings/files list.
- Meeting Detail route at `/meetings/:meetingId`, including editable meeting metadata, agenda, meeting materials, meeting audio upload, attendees, and action items.
- Action Items Tracker route at `/action-items`.
- Topbar notification dropdown. Read/unread state is currently UI-local; persisted notification read state is planned in [GitHub issue #25](https://github.com/DOSTSquad/meeting-mgnt/issues/25).

### Backend

The Express API currently supports:

- JWT auth with email-only login.
- Meeting CRUD, status transitions, pagination, full-text search, tags, and meeting file counts.
- Meeting request scheduling flow before a real meeting exists.
- Invitee-safe availability response endpoints.
- Meeting participant role management. RSVP has been removed as a product/API concept.
- Meeting-scoped file uploads to MinIO with presigned downloads.
- Meeting action item CRUD and assignee/status filters.
- Dedicated meeting minutes API with `content`, `keyDiscussions`, `decisions`, `facilitatorId`, `recorderId`, and status.
- Dashboard aggregate data and derived notifications.
- Development-only `/api/dev` endpoints when the server is started with `NODE_ENV=development`.

## How to Run Tests

From the repo root:

- Run all workspace tests:
  `npm run test`
- Run server tests only (Jest):
  `npm run test --workspace=server`
- Run DB-backed server tests:
  `npm run test:db --workspace=server`

DB-backed test prerequisites:

- Start PostgreSQL:
  `docker compose up -d postgres`
- Ensure `DATABASE_URL` in `.env` matches your running Postgres credentials.

## Health Checks

The API exposes three health endpoints once the server is running:

| Endpoint        | Purpose                                              |
| --------------- | ---------------------------------------------------- |
| `/health/live`  | Process liveness only                                |
| `/health/ready` | Readiness check against PostgreSQL, Redis, and MinIO |
| `/health`       | Combined readiness response with uptime              |

When dependencies are unavailable, `/health` and `/health/ready` return `503` with per-service details.

## API

The server exposes JWT-protected REST endpoints under `/api`:

- `/api/auth` — register, login, current user
- `/api/meetings` — full CRUD with RFC 5988 `Link`-header pagination, filters by status / date range, full-text search on title + description via `?q=`, tags, and file counts; `status` transitions are forward-only (scheduled → in_progress → completed → archived, with cancelled as a side-branch)
- `/api/meeting-requests` — scheduling request flow with time options, invitees, binary availability responses, and confirmation into a real meeting
- `/api/meetings/:id/participants` — add, list, update role, and remove meeting participants
- `/api/meetings/:id/files` + `/api/files/:id` — upload (PDF/DOCX/XLSX/PPTX/images, 50 MB cap), list, presigned download (60 s URL), and delete meeting files
- `/api/meetings/:id/action-items` + `/api/action-items/:id` — create, list (filter by status/assignee), update, and delete meeting action items (statuses: todo, in_progress, blocked, completed, cancelled)
- `/api/meetings/:id/minutes` — read/update dedicated meeting minutes; `GET` eagerly creates an empty draft if one does not exist
- `/api/dashboard` — upcoming meetings, pending meeting requests, pending availability requests, and current user's action items
- `/api/notifications` — currently returns derived notification items; persisted read/unread state is planned

See [`server/README.md`](server/README.md#api-endpoints) for the full endpoint matrix and request/response shapes, and [`docs/postman/dost-meeting-mgnt.postman_collection.json`](docs/postman/dost-meeting-mgnt.postman_collection.json) for an importable Postman collection.

## Design Files

Pencil designs live under `designs/`.

Current notable frames include:

- Meeting Repository
- Meeting Detail
- Meeting Detail - Minutes Flow
- Action Items Tracker
- Create Meeting host flow
- Participant availability flow

## Known Gaps / Planned Work

- Persisted notifications with read/unread API state are planned in [issue #25](https://github.com/DOSTSquad/meeting-mgnt/issues/25).
- The client minutes generation/editing UI is designed in Pencil but not fully implemented in React yet.
- Notification delivery channels such as email, push, Slack, and Teams are out of scope for the current local app.
