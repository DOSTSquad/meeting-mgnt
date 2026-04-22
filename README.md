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

## Health Checks

The API exposes three health endpoints once the server is running:

| Endpoint        | Purpose                                              |
| --------------- | ---------------------------------------------------- |
| `/health/live`  | Process liveness only                                |
| `/health/ready` | Readiness check against PostgreSQL, Redis, and MinIO |
| `/health`       | Combined readiness response with uptime              |

When dependencies are unavailable, `/health` and `/health/ready` return `503` with per-service details.
