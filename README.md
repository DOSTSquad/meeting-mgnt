# meeting-mgnt

The meeting management system enables users to organise meetings, assign action items, and generate minutes automatically.

## Structure

```
meeting-mgnt/
├── client/   # React front-end (@meeting-mgnt/client)
└── server/   # Node.js/Express back-end (@meeting-mgnt/server)
```

The root `package.json` declares both as npm workspaces.

## Setup

1. Copy `.env.example` to `.env`.
2. Run `npm install` from the repo root.
3. Start local infra with `docker compose up -d`.
4. Start the apps you need:
   `npm run dev --workspace=server`
   `npm run dev --workspace=client`

The Compose stack starts PostgreSQL 16, Redis 7, MinIO, and a one-shot `minio-init` sidecar. PostgreSQL also mounts [`scripts/postgres-init.sql`](/Users/jhowliu/Developer/ifn735/meeting-mgnt/scripts/postgres-init.sql) on first boot to enable the `pgcrypto` and `uuid-ossp` extensions.

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
- `/api/meetings` — full CRUD with RFC 5988 `Link`-header pagination, filters by status / date range, and full-text search on title + description via `?q=`; `status` transitions are forward-only (scheduled → in_progress → completed → archived, with cancelled as a side-branch)
- `/api/meetings/:id/participants` — add, list, update role, and remove meeting participants
- `/api/meetings/:id/files` + `/api/files/:id` — upload (PDF/DOCX/XLSX/PPTX/images, 50 MB cap), list, presigned download (60 s URL), and delete meeting files
- `/api/meetings/:id/action-items` + `/api/action-items/:id` — create, list (filter by status/assignee), update, and delete meeting action items (statuses: todo, in_progress, blocked, completed, cancelled)

See [`server/README.md`](server/README.md#api-endpoints) for the full endpoint matrix and request/response shapes, and [`docs/postman/dost-meeting-mgnt.postman_collection.json`](docs/postman/dost-meeting-mgnt.postman_collection.json) for an importable Postman collection.
