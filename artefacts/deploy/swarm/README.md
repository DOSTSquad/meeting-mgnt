# Docker Swarm Deployment

This directory contains a baseline Docker Swarm deployment for DOST Meeting Management.

Use `pilot-stack.yml` for an MVP or client demo with single-node PostgreSQL, Redis, and MinIO. Use
`stack.yml` for a cleaner client deployment where PostgreSQL, Redis, and MinIO are provided by
dedicated HA services outside the app stack.

## Files

| File                | Purpose                                                                               |
| ------------------- | ------------------------------------------------------------------------------------- |
| `Dockerfile.api`    | Builds the Express API image.                                                         |
| `Dockerfile.web`    | Builds the React static web app served by Caddy.                                      |
| `Caddyfile`         | Swarm Caddy config; serves React and proxies `/api/*` plus `/health*` to `api:3001`.  |
| `stack.yml`         | App-tier Swarm stack for production-style deployment with external stateful services. |
| `pilot-stack.yml`   | MVP/pilot Swarm stack with single-node PostgreSQL, Redis, and MinIO.                  |
| `swarm.env.example` | Example environment values for image names and runtime configuration.                 |

## Build And Push Images

Run these commands from the repository root:

```bash
export IMAGE_TAG=0.1.0
export REGISTRY=registry.example.com

docker build -f deploy/swarm/Dockerfile.api -t "$REGISTRY/meeting-mgnt-api:$IMAGE_TAG" .
docker build -f deploy/swarm/Dockerfile.web --build-arg VITE_API_BASE_URL=/ -t "$REGISTRY/meeting-mgnt-web:$IMAGE_TAG" .

docker push "$REGISTRY/meeting-mgnt-api:$IMAGE_TAG"
docker push "$REGISTRY/meeting-mgnt-web:$IMAGE_TAG"
```

For a single-node MVP where the manager builds and runs the images locally, pushing to a registry is
not required. For a multi-node Swarm, every node must be able to pull the images.

## Initialize Swarm

On the first manager node:

```bash
docker swarm init --advertise-addr <manager-private-ip>
```

For pilot deployments that use local Swarm volumes for PostgreSQL and MinIO, label the storage node:

```bash
docker node update --label-add meeting-mgnt.storage=true <node-name>
```

## Configure Environment

Create a local deployment environment file and replace the placeholder values:

```bash
cp deploy/swarm/swarm.env.example deploy/swarm/swarm.env
```

Load it before deploying:

```bash
set -a
. deploy/swarm/swarm.env
set +a
```

Do not commit `deploy/swarm/swarm.env`.

## Deploy MVP / Pilot Stack

The pilot stack includes single-node PostgreSQL, Redis, and MinIO. It is useful for MVP demos and
small non-HA pilots, not for the final 10,000-user HA topology.

```bash
docker stack deploy -c deploy/swarm/pilot-stack.yml meeting-mgnt
```

Run database migrations after the services are up:

```bash
docker run --rm \
  --network meeting-mgnt_backend \
  --env-file deploy/swarm/swarm.env \
  "$API_IMAGE" \
  npm run migrate --workspace=server
```

Check service status:

```bash
docker stack services meeting-mgnt
docker service logs meeting-mgnt_api --tail 100
curl -fsS http://localhost/health/live
curl -fsS http://localhost/health/ready
```

## Deploy App Tier With External Stateful Services

Use this when PostgreSQL, Redis, and MinIO are hosted separately:

```bash
docker stack deploy -c deploy/swarm/stack.yml meeting-mgnt
```

Run migrations against the external database:

```bash
docker run --rm \
  --network meeting-mgnt_backend \
  --env-file deploy/swarm/swarm.env \
  "$API_IMAGE" \
  npm run migrate --workspace=server
```

## Update A Release

Build and push the new images, update `API_IMAGE` and `WEB_IMAGE`, reload the env file, then run:

```bash
docker stack deploy -c deploy/swarm/stack.yml meeting-mgnt
```

For the pilot stack, use:

```bash
docker stack deploy -c deploy/swarm/pilot-stack.yml meeting-mgnt
```

Swarm applies rolling updates based on the service `deploy.update_config` settings.

## Production Notes

- Docker Compose remains best for local development and one-node demos.
- Docker Swarm is a practical containerized next step for Caddy, React, Express API, and workers.
- PostgreSQL, Redis, and MinIO still need explicit HA, backup, persistent storage, and failover design.
- For 10,000-user production, prefer external HA PostgreSQL and distributed MinIO over the pilot stack.
- Caddy uses one replica by default. If scaling Caddy replicas, plan certificate storage and ingress/load-balancer behavior.
