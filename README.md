# DOST Meeting Management

Meeting Management is a workspace app for creating meeting scheduling requests, collecting participant availability, confirming meetings, managing meeting files, tracking action items, maintaining dedicated meeting minutes, and turning recordings into reviewable AI summaries and action items.

## Structure

```
meeting-mgnt/
├── client/                  # Vite + React + Tailwind front-end
├── server/                  # Node.js + Express API and workflow worker
│   ├── db/migrations/       # versioned SQL migrations
│   └── scripts/             # migrate/seed scripts
├── ai-service/              # Python AI worker (Whisper transcription, Ollama analysis)
├── deploy/                  # Caddyfile and systemd units
├── docs/                    # deployment guidelines, GPU runbook, technical spec, Postman collection
├── designs/                 # Pencil design files
├── docker-compose.yml       # local PostgreSQL, Redis, MinIO (AI services in the `ai` profile)
└── package.json             # npm workspace root
```

The root `package.json` declares `client` and `server` as npm workspaces.

## Setup

1. Copy `.env.example` to `.env`.
2. Run `npm install` from the repo root.
3. Start local infra with `docker compose up -d`.
4. Apply database migrations with `npm run migrate --workspace=server`.
5. Optional: seed local demo data with `npm run seed --workspace=server`. It prints a generated password for the seeded accounts once at the end (or uses `SEED_PASSWORD` from `.env`), never resets accounts that already exist unless `SEED_RESET_PASSWORDS=true`, and refuses to run with `NODE_ENV=production`.
6. Start the API with `npm run dev --workspace=server`.
7. Start the worker runtime with `npm run worker:dev --workspace=server` when `AI_PIPELINE_ENABLED=true`. Run one worker only; without it, generation requests stay `queued`.
8. Start the client with `npm run dev --workspace=client`.

The Compose stack starts PostgreSQL 16, Redis 7, MinIO, and a one-shot `minio-init` sidecar. PostgreSQL also mounts [`scripts/postgres-init.sql`](scripts/postgres-init.sql) on first boot to enable the `pgcrypto` and `uuid-ossp` extensions. The optional AI containers are in the `ai` profile: `ai-service` (health/API wrapper), `ai-worker` (Redis Streams consumer that runs Whisper and Llama 3), and `ollama` (the local model runtime it calls). Start them with `docker compose --profile ai up -d --build`, then pull the language model once with `docker compose exec ollama ollama pull llama3` (~4.7 GB). Neither container starts on a plain `docker compose up`.

The server defaults to port `3001`. The Vite client uses the normal Vite dev port and reads `VITE_*` environment variables only.

When the AI workflow is enabled, keep the API, server worker runtime, and Python AI worker separate.
The API handles HTTP, the server worker publishes the PostgreSQL outbox to Redis Streams and consumes
AI results, and the Python worker executes Whisper or LLM jobs.

## Database Migrations

Run server migrations with:

`npm run migrate --workspace=server`

Migrations are SQL files in `server/db/migrations`, tracked in the `schema_migrations` table.

## Common Commands

| Task                       | Command                                 |
| -------------------------- | --------------------------------------- |
| Lint all workspaces        | `npm run lint`                          |
| Test all workspaces        | `npm run test`                          |
| Format check               | `npm run format`                        |
| Format write               | `npm run format:fix`                    |
| Run server                 | `npm run dev --workspace=server`        |
| Run worker runtime         | `npm run worker:dev --workspace=server` |
| Run client                 | `npm run dev --workspace=client`        |
| Run server tests (Jest)    | `npm run test --workspace=server`       |
| Run DB-backed server tests | `npm run test:db --workspace=server`    |
| Run server migrations      | `npm run migrate --workspace=server`    |
| Seed local demo data       | `npm run seed --workspace=server`       |
| Build client               | `npm run build --workspace=client`      |

## Codex Cage

This repository is configured for issue-driven development with [Codex Cage](https://github.com/jhowliu/codex-cage). Codex Cage clones the repository into a disposable Docker workspace, starts isolated PostgreSQL, Redis, and MinIO services, runs implementation and independent review agents, verifies the result, scans the diff for secrets, and opens a pull request only after all gates pass.

Requirements:

- Node.js 22 or later
- Docker
- Codex Cage installed from its repository
- Codex OAuth or `OPENAI_API_KEY`
- A fine-grained `GITHUB_TOKEN` with repository Contents read/write, Issues read, Pull requests read/write, and Metadata read permissions

Copy `.codex-cage.env.example` to `.codex-cage.env` and add local credentials. The real file and all local run state are ignored by Git.

Run a GitHub issue:

```bash
codex-cage run https://github.com/DOSTSquad/meeting-mgnt/issues/123
```

Run a Linear issue by specifying this repository:

```bash
codex-cage run https://linear.app/ORG/issue/DOS-123/title --repo DOSTSquad/meeting-mgnt
```

Inspect or clean up runs:

```bash
codex-cage runs list
codex-cage runs show <run-id>
codex-cage cleanup
```

Codex Cage uses `.codex-cage/test.env` only for disposable test services. Real application and provider credentials must remain in the local `.env` or `.codex-cage.env` files.

### GitHub Actions

The `Codex Cage issue run` workflow starts when an issue receives the `codex-cage:run` label. It runs Codex Cage in Docker mode, opens a pull request after verification and independent review pass, uploads run artifacts, and updates the issue labels to show the result.

Configure these repository secrets before triggering the workflow:

| Name                      | Purpose                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `OPENAI_API_KEY`          | Codex authentication for implementation and review agents                                                          |
| `CODEX_CAGE_GITHUB_TOKEN` | Fine-grained token with Contents read/write, Issues read/write, Pull requests read/write, and Metadata read access |

The workflow uses these issue labels:

| Label                         | Purpose                                |
| ----------------------------- | -------------------------------------- |
| `codex-cage:run`              | Trigger a run                          |
| `codex-cage:in-progress`      | A run is active                        |
| `codex-cage:ready-for-review` | The run opened a verified pull request |
| `codex-cage:blocked`          | The run failed and needs attention     |

The Codex Cage source revision is pinned in `.github/workflows/codex-cage-issue.yml`. Update `CODEX_CAGE_REF` deliberately after testing a newer revision.

## Caddy Deployment

[`deploy/Caddyfile`](deploy/Caddyfile) serves the built React app and proxies API traffic to the Express server.

See [Deployment Guidelines](docs/deployment-guidelines.md) for the supported
single-host topology, release procedure, operational checks, and AI capacity
considerations. The optional [GPU Benchmark Runbook](docs/gpu-benchmark-runbook.md)
documents the Windows WSL2/CUDA validation path.

## Bootstrap a New VPS

On a fresh Ubuntu 22.04/24.04 host, [`scripts/bootstrap-vps.sh`](scripts/bootstrap-vps.sh) does the
one-time setup that the sections below describe by hand: Node.js 22, Docker, Caddy,
PostgreSQL/Redis/MinIO, the AI worker, the systemd units, and the sudoers rule the Deploy workflow
needs. Run it once as root; afterwards the Deploy workflow keeps the host up to date.

```bash
sudo bash scripts/bootstrap-vps.sh --deploy-user deploy --admin-email admin@example.org \
  --domain meeting.example.com
```

| Option             | Purpose                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `--deploy-user`    | Account the Deploy workflow SSHes in as; owns the app directory. Defaults to the sudo caller |
| `--admin-email`    | Create this administrator after the migrations (required on a fresh host, see below)         |
| `--admin-name`     | Display name for that account (default `Administrator`)                                      |
| `--domain`         | Serve this domain over automatic HTTPS. Without it the site is HTTP on the server's IP       |
| `--app-dir`        | Application directory (default `/srv/meeting-mgnt`)                                          |
| `--repo-url`       | Repository to clone; defaults to the origin of an existing checkout                          |
| `--ai-mode`        | `whisper` (default, Whisper + Ollama containers) or `fixture` (canned output, no models)     |
| `--skip-preflight` | Skip the OS, architecture, systemd, RAM and disk checks                                      |

Self-registration is closed by default, so a host with no administrator has nobody who can log in.
`--admin-email` therefore creates the first admin (`server/scripts/create-admin.js`). The password
comes from the `ADMIN_PASSWORD` environment variable if you set it (through sudo:
`sudo --preserve-env=ADMIN_PASSWORD bash scripts/bootstrap-vps.sh ...`), otherwise a random one is
generated and printed once at the end of the run; it is never passed as an argument. On a re-run the
account is left as it is and no password is printed; without `--admin-email` a re-run succeeds when
an administrator already exists and stops with an error when none does.

The script is idempotent and never modifies an existing `.env`. It generates the database, MinIO
and JWT secrets, but the SMTP/Resend credentials are for outside services, so edit those in `.env`
yourself. It also leaves these to you: adding the deploy public key to the deploy user's
`authorized_keys`, creating the `production` environment secrets below, pointing DNS at the host,
and running the Deploy workflow once to ship `client/dist`.

Whisper + Ollama on CPU needs at least 8 GiB RAM and 20 GiB free disk (the script refuses
less); [Deployment Guidelines](docs/deployment-guidelines.md) suggests 8 vCPU / 16 GiB RAM as a
starting point. The GPU compose file is not covered by the script.

## GitHub Actions Deployment

The [`Deploy`](.github/workflows/deploy.yml)
workflow runs on pushes to `main` and can also be started manually from GitHub Actions.

Configure these secrets on the `production` **environment**, not as repository
secrets. Repository secrets are readable by any workflow on any branch, which
lets anyone with write access run a workflow that exfiltrates the deploy key.
Environment secrets are only released to a job that declares
`environment: production`, and that job is subject to the environment's
deployment branch policy.

| Name             | Purpose                                    |
| ---------------- | ------------------------------------------ |
| `DEPLOY_HOST`    | VPS host or IP address                     |
| `DEPLOY_USER`    | SSH user that can access the app directory |
| `DEPLOY_SSH_KEY` | Private SSH key for the deploy user        |
| `DEPLOY_PORT`    | Optional SSH port; defaults to `22`        |

Optional repository variables:

| Name                            | Default                          |
| ------------------------------- | -------------------------------- |
| `DEPLOY_PATH`                   | `/srv/meeting-mgnt`              |
| `DEPLOY_SERVICE_NAME`           | `meeting-mgnt-server.service`    |
| `DEPLOY_WORKER_SERVICE_NAME`    | `meeting-mgnt-worker.service`    |
| `DEPLOY_AI_WORKER_SERVICE_NAME` | `meeting-mgnt-ai-worker.service` |

The client bundle is built on the GitHub runner and copied to the VPS with
`rsync`, so the VPS never installs devDependencies or runs Vite. The VPS deploy
user must be able to run `git fetch`, `npm ci --omit=dev`, and
`npm run migrate --workspace=server`, and `rsync` must be installed
(`sudo apt install rsync`).

Deploy also calls `systemctl` over sudo. If the deploy user is not root, grant
passwordless sudo for exactly these six commands:

```
<deploy_user> ALL=(root) NOPASSWD: /usr/bin/systemctl restart meeting-mgnt-server.service, \
                           /usr/bin/systemctl restart meeting-mgnt-worker.service, \
                           /usr/bin/systemctl restart meeting-mgnt-ai-worker.service, \
                           /usr/bin/systemctl status meeting-mgnt-server.service --no-pager, \
                           /usr/bin/systemctl status meeting-mgnt-worker.service --no-pager, \
                           /usr/bin/systemctl status meeting-mgnt-ai-worker.service --no-pager
```

Edit sudoers with `sudo EDITOR=vim visudo`, never a bare editor: visudo validates
the syntax before saving, and a malformed sudoers file disables sudo entirely.

Two things about that rule are easy to get wrong:

- **Arguments are matched exactly.** A rule ending in `meeting-mgnt-worker.service`
  does not authorise `... meeting-mgnt-worker.service --no-pager`, so the
  `--no-pager` variants have to be listed separately. Deploy only runs
  `systemctl status` on the failure path, so a missing rule stays invisible until
  the run where you actually need the diagnostics.
- **Only these six need sudo.** Deploy calls `systemctl list-unit-files`,
  `is-failed`, and `is-active` unprivileged; they are read-only and must not be
  added to the sudoers rule.

Run the Express API as a private service on the VPS:

```bash
sudo useradd --system --home /srv/meeting-mgnt --shell /usr/sbin/nologin meeting-mgnt
sudo chown -R meeting-mgnt:meeting-mgnt /srv/meeting-mgnt
sudo cp deploy/meeting-mgnt-server.service /etc/systemd/system/meeting-mgnt-server.service
sudo systemctl daemon-reload
sudo systemctl enable --now meeting-mgnt-server
```

The service assumes the app is deployed at `/srv/meeting-mgnt`, `.env` exists there, and Node is available at `/usr/bin/node`; edit the service file if your VPS differs.

### Choosing the service account

The unit files ship with `User=meeting-mgnt` / `Group=meeting-mgnt`, which
requires the `useradd` line above. **Whatever you choose, all units must
agree** — the API and the workers share `/srv/meeting-mgnt` and its `.env`.

If you skip creating the dedicated account and run the services as root instead,
delete the `User=` and `Group=` lines from every unit file. Leaving them in place
while the account does not exist fails at startup with a misleading error:

```
meeting-mgnt-worker.service: Failed to determine user credentials: No such process
```

That message means systemd could not resolve the `User=`, not that a process is
missing. Check what an already-working unit uses before installing a new one:

```bash
systemctl show -p User -p Group --value meeting-mgnt-server.service
```

Empty output means the unit runs as root.

Note that `chown -R meeting-mgnt:meeting-mgnt /srv/meeting-mgnt` is only correct
when the deploy user can still write there. Deploy runs `git pull`, `npm ci`, and
receives `rsync` into that directory as the SSH user from `DEPLOY_USER`, so
handing exclusive ownership to a different account breaks every later deploy.

Install the worker runtime as a second unit:

```bash
sudo cp deploy/meeting-mgnt-worker.service /etc/systemd/system/meeting-mgnt-worker.service
sudo systemctl daemon-reload
sudo systemctl enable --now meeting-mgnt-worker
```

Deploy restarts the worker unit only when it is already installed, so the
workflow stays green until you run the commands above.

On a host that cannot run the models, install the AI worker as a third unit with
the fixture providers (`ai-service/.venv` and the unit are set up as described in
[`ai-service/README.md`](ai-service/README.md#fixture-only-host)). Deploy then
refreshes `ai-service/.venv` from `requirements.fixture.txt` and restarts
`meeting-mgnt-ai-worker.service`, again only when it is installed.

The worker exits `0` when `AI_PIPELINE_ENABLED` is not `true`, so systemd reports
it as `inactive (dead)` rather than failed. That is the expected state while the
AI pipeline is off; deploy only fails the run when the unit is actually
`failed`. Enabling the pipeline requires `AI_PIPELINE_ENABLED=true` plus a
reachable `REDIS_URL` and `DATABASE_URL` in `.env` on the VPS, otherwise the
worker fails its startup validation. The full list of workflow settings is in
[`.env.example`](.env.example);
copy any new keys to the VPS `.env` before enabling it.

When `AI_TRANSCRIPTION_PROVIDER=whisper`, build and health-check the existing
FastAPI container on the VPS before restarting the worker:

```bash
cd /srv/meeting-mgnt
docker compose --profile ai up -d --build --wait ai-service ollama
docker compose exec ollama ollama pull llama3
curl --fail http://127.0.0.1:8000/health
sudo systemctl restart meeting-mgnt-worker
```

The automated deploy currently restarts an installed worker but does not manage
the optional AI container, so repeat the Compose command when `ai-service/`, its
Dockerfile, or Python dependencies change.

When the Express API is behind Caddy, set `TRUST_PROXY=true` in the server `.env` so API rate limiting keys on the forwarded client IP rather than Caddy's loopback address.

For the current IP-only deployment at `194.195.127.196`:

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

For a domain with automatic HTTPS, set Caddy environment variables with a systemd override before reloading:

```bash
sudo systemctl edit caddy
```

Add:

```ini
[Service]
Environment=APP_SITE=meeting.example.com
Environment=CLIENT_DIST=/srv/meeting-mgnt/client/dist
```

Then run:

```bash
sudo systemctl reload caddy
```

Build the client with same-origin API calls for Caddy:

```bash
VITE_API_BASE_URL=/ npm run build --workspace=client
```

Production client builds also fall back to same-origin `/` if `VITE_API_BASE_URL` is omitted. Local development still defaults to `http://localhost:3001`.

Keep the Express server listening on `127.0.0.1:3001`/`3001`, then Caddy handles public `80`/`443`.

If `http://194.195.127.196/health` returns `502 Bad Gateway`, Caddy is reachable but the upstream API is not answering. Check the private API first:

```bash
curl -i http://127.0.0.1:3001/health/live
sudo systemctl status meeting-mgnt-server --no-pager
sudo journalctl -u meeting-mgnt-server -n 100 --no-pager
sudo journalctl -u caddy -n 100 --no-pager
```

`/health/live` should return `200`. If it does, check `/health` next; a `503` from `/health` means the API process is up but PostgreSQL, Redis, or MinIO is unavailable or misconfigured.

## Current Product Surface

### Client

The React client currently includes:

- Email and password authentication with self-service registration. Admin accounts also get an Admin page for user and role management.
- Dashboard with upcoming meetings, pending host-created meeting requests, invitee availability requests, action items, and notification dropdown.
- Five-step create meeting flow:
  1. Create request metadata.
  2. Add candidate time options.
  3. Invite participants by email/user.
  4. Review availability responses.
  5. Confirm the final meeting.
- Invitee availability voting modal from the dashboard.
- Meeting Repository route at `/meetings`, organized by meeting tags with a scannable meetings/files list.
- Meeting Detail route at `/meetings/:meetingId`, including editable meeting metadata, agenda, manual minutes, meeting materials, recording upload (audio, or a video whose audio track is extracted in the browser), transcript and AI analysis review, attendees, change requests, and action items.
- Action Items Tracker route at `/action-items`.
- Topbar notification dropdown with persisted read and archive state.

### Backend

The Express API currently supports:

- JWT auth with email and password login and self-service registration.
- Role-based access: `staff`/`admin` accounts plus per-meeting owner/organizer/attendee/optional roles, defined in `server/services/permissions.js` (see [`server/README.md`](server/README.md#roles-and-permissions)).
- Meeting CRUD, simple status transitions, pagination, full-text search, tags, and meeting file counts.
- Meeting request scheduling flow before a real meeting exists, with emailed invitation links and calendar (`.ics`) emails.
- Invitee-safe availability response endpoints.
- Meeting participant role management. RSVP has been removed as a product/API concept.
- Meeting-scoped file uploads to MinIO with presigned downloads.
- Meeting action item CRUD and assignee/status filters.
- Dedicated meeting minutes API with `content`, `keyDiscussions`, `decisions`, `facilitatorId`, `recorderId`, and status.
- Recording upload, Whisper transcription, local LLM analysis, and reviewable action-item suggestions through the outbox, Redis Streams, and the AI worker (live status over SSE).
- Attendee change requests, readable only by the meeting owner.
- Dashboard aggregate data and derived notifications.
- Development-only `/api/dev` endpoints (admin accounts only) when the server is started with `NODE_ENV=development`.

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

- `/api/auth` — login, current user, change own password (`PUT /me/password`), and register (closed unless `SELF_REGISTRATION_ENABLED=true`; admins create accounts with `POST /api/users`)
- `/api/users` — list the user directory; admins can update roles/profiles and delete users
- `/api/meetings` — full CRUD with RFC 5988 `Link`-header pagination, filters by status / date range, full-text search on title + description and uploaded file names via `?q=`, tags, and file counts; `status` transitions are forward-only (scheduled → completed → archived, with cancelled as a side branch)
- `/api/meeting-requests` — scheduling request flow with time options, invitees, binary availability responses, and confirmation into a real meeting
- `/api/meetings/:id/participants` — add, list, update role, and remove meeting participants
- `/api/meetings/:id/files` + `/api/files/:id` — upload (PDF/DOCX/XLSX/PPTX/images, 50 MB cap), list, presigned download (60 s URL), and delete meeting files
- `/api/meetings/:id/action-items` + `/api/action-items/:id` — create, list (filter by status/assignee), update, and delete meeting action items (statuses: todo, in_progress, completed, cancelled)
- `/api/meetings/:id/minutes` — read/update dedicated meeting minutes; `GET` eagerly creates an empty draft if one does not exist
- `/api/meetings/:id/recording` — upload (the request must confirm participant consent with `consentConfirmed=true`), read, archive, and generate from the meeting recording; `/analysis` returns the latest transcript, analysis, and suggestions; `/api/meetings/:id/workflow/events` streams status over SSE
- `/api/meetings/:id/analysis-suggestions` — edit, accept, or reject AI-suggested action items
- `/api/meetings/:id/change-requests` — attendees send change requests; only the owner reads them
- `/api/public/invitations/:token` — invitee availability through an emailed link, no sign-in
- `/api/tags` — list and create meeting tags
- `/api/dashboard` — upcoming meetings, pending meeting requests, pending availability requests, and current user's action items
- `/api/notifications` — persisted notifications with read and archive state

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

## Known Limitations

- AI processing runs on CPU by default and takes minutes per recording; the optional GPU profile is in [`docs/gpu-benchmark-runbook.md`](docs/gpu-benchmark-runbook.md).
- Uploads are limited to 50 MB per file, including audio extracted from a video (about 52 minutes at 128 kbps).
- Notifications are in-app plus invitation and calendar emails; push, Slack, and Teams are not implemented.
