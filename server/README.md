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
