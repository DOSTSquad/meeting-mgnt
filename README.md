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

## Health Checks

The API exposes three health endpoints once the server is running:

| Endpoint        | Purpose                                              |
| --------------- | ---------------------------------------------------- |
| `/health/live`  | Process liveness only                                |
| `/health/ready` | Readiness check against PostgreSQL, Redis, and MinIO |
| `/health`       | Combined readiness response with uptime              |

When dependencies are unavailable, `/health` and `/health/ready` return `503` with per-service details.
