# Testing Results Report

Date: 2026-10-07

This report records the automated validation of the DOST Meeting Management system for project
handover, and a local smoke test of the running system. It replaces the report of 3 June 2026, which covered 9 server test suites and predates
most of the delivered code.

## Summary

| Area                            | Status                  | Evidence                                                                                       |
| ------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| Linting                         | Passed                  | ESLint reported no errors in the client and server workspaces.                                 |
| Server tests without a database | Passed                  | 35 suites and 453 tests passed; 144 database-backed tests were skipped.                        |
| Server tests with PostgreSQL    | Passed                  | All 43 suites and 597 tests passed, including the database-backed tests.                       |
| Client tests                    | Passed                  | 62 tests passed.                                                                               |
| AI service tests                | Passed                  | 16 of 20 tests passed; 4 were skipped because they need PyTorch.                               |
| Client production build         | Passed                  | Vite built the production bundle (2,796 modules).                                              |
| Local smoke test (API level)    | Passed                  | 38 of 38 checks over HTTP on an isolated local stack, with real Whisper and Ollama processing. |
| Browser walkthrough             | Not run for this report | Manual procedure; see "Validation not covered by this report".                                 |
| Smoke test on a deployed host   | Not run for this report | Manual procedure; see "Validation not covered by this report".                                 |

## Test Environment

| Item            | Value                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| Code version    | Commit `b075593` on branch `jhowliu/deployment-guide-managed-options`, based on `main` at `f9dd2ab`              |
| Host            | macOS 15.7.4                                                                                                     |
| Node.js         | 22.16.0 with npm 11.4.1; Jest 30.2.0 for server tests, the Node test runner for client tests                     |
| Database        | PostgreSQL 16.15 (`postgres:16-alpine`) in a disposable container with the `pgcrypto` and `uuid-ossp` extensions |
| Python          | 3.13.0 in a virtual environment with `ai-service/requirements.fixture.txt` installed (no PyTorch)                |
| Mocked services | Redis and object storage are replaced by test doubles in the automated server tests                              |

The database-backed tests truncate tables, so they ran against the disposable database rather than a
development database. Every migration in `server/db/migrations` was applied to the empty database
before the tests ran.

## Commands and Observed Results

### Linting

```bash
npm run lint
```

```text
> @meeting-mgnt/client@0.0.0 lint
> eslint .

> @meeting-mgnt/server@0.1.0 lint
> eslint .
```

ESLint printed no warnings or errors, and the command exited with status 0.

### Server tests without a database

```bash
npm run test --workspace=server
```

```text
Test Suites: 8 skipped, 35 passed, 35 of 43 total
Tests:       144 skipped, 453 passed, 597 total
Time:        3.361 s
```

### Server tests with PostgreSQL

```bash
npm run test:db --workspace=server
```

```text
Test Suites: 43 passed, 43 total
Tests:       597 passed, 597 total
Time:        21.699 s
```

### Client tests

```bash
npm run test --workspace=client
```

```text
# tests 62
# suites 3
# pass 62
# fail 0
# skipped 0
```

### AI service tests

```bash
cd ai-service
python -m unittest discover -s tests -t .
```

```text
Ran 20 tests in 0.299s
OK (skipped=4)
```

The four skipped tests check the CPU and GPU compute profiles and are skipped when PyTorch is not
installed.

### Client production build

```bash
VITE_API_BASE_URL=/ npm run build --workspace=client
```

```text
✓ 2796 modules transformed.
✓ built in 655ms
```

## Local Smoke Test

A smoke test drove the running system over HTTP with a script, on an isolated local stack, on
7 October 2026. It used the same code as the automated tests (commit `b075593`) and real Whisper and
Ollama processing. It did not use a browser, and it did not run behind Caddy or under systemd.

| Item           | Value                                                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host           | Apple M2 Pro, 32 GiB RAM, macOS 15.7.4, Docker 28.0.4                                                                                                            |
| API and worker | Node.js 22.16.0, started directly (`node index.js`, `node worker.js`) with `AI_PIPELINE_ENABLED=true`                                                            |
| Data services  | PostgreSQL 16 (`postgres:16-alpine`), Redis 7 (`redis:7-alpine`, `noeviction`), Silo (`pgsty/silo:RELEASE.2026-09-16T00-00-00Z`), each in a disposable container |
| Email          | SMTP pointed at a local Mailpit container, so messages were captured and none left the host                                                                      |
| AI worker      | `ai-service` container image with the current `app/` code; Whisper `small` on CPU                                                                                |
| LLM            | Ollama 0.35.0 running natively on macOS (Apple GPU) with `llama3`                                                                                                |
| Recording      | `ai-service/test-fixtures/input/power_system_meeting_3min_final.mp3` (3 min 4 s, 4.2 MB)                                                                         |
| Data           | A new empty database; the first administrator was created with `npm run create-admin`, and all other data by the script                                          |

### Results

All 38 checks passed.

| #   | Area                 | Check                                                                            | Expected              | Result                                                                    |
| --- | -------------------- | -------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------- |
| 1   | Health and accounts  | GET /health/live                                                                 | 200                   | 200                                                                       |
| 2   | Health and accounts  | GET /health/ready (PostgreSQL, Redis, object storage)                            | 200                   | 200 (postgres:ok, redis:ok, minio:ok)                                     |
| 3   | Health and accounts  | Unauthenticated GET /api/meetings                                                | 401                   | 401                                                                       |
| 4   | Health and accounts  | Administrator sign-in (POST /api/auth/login)                                     | 200                   | 200                                                                       |
| 5   | Health and accounts  | Self-registration closed (POST /api/auth/register)                               | 403                   | 403                                                                       |
| 6   | Health and accounts  | Administrator creates a staff account (POST /api/users)                          | 201                   | 201                                                                       |
| 7   | Health and accounts  | Administrator creates a second staff account                                     | 201                   | 201                                                                       |
| 8   | Health and accounts  | Staff sign-in                                                                    | 200                   | 200                                                                       |
| 9   | Health and accounts  | Staff cannot create accounts (POST /api/users)                                   | 403                   | 403                                                                       |
| 10  | Health and accounts  | Dashboard (GET /api/dashboard)                                                   | 200                   | 200                                                                       |
| 11  | Scheduling and email | Create meeting request (POST /api/meeting-requests)                              | 201                   | 201                                                                       |
| 12  | Scheduling and email | Add time options                                                                 | 200                   | 200                                                                       |
| 13  | Scheduling and email | Add an external invitee                                                          | 200                   | 200                                                                       |
| 14  | Scheduling and email | Send invitations (POST .../send-invitations)                                     | 200                   | 200                                                                       |
| 15  | Scheduling and email | Invitation email delivered to the invitee (Mailpit)                              | one message           | "Meeting invitation: Smoke Test Review"                                   |
| 16  | Scheduling and email | Invitation email carries a response link                                         | token in link         | found                                                                     |
| 17  | Scheduling and email | Open the invitation link without signing in (GET /api/public/invitations/:token) | 200                   | 200                                                                       |
| 18  | Scheduling and email | Invitee submits availability through the link                                    | 200                   | 200 (2 options)                                                           |
| 19  | Scheduling and email | Request moves to ready_to_confirm after all invitees respond                     | ready_to_confirm      | ready_to_confirm                                                          |
| 20  | Scheduling and email | Confirm the meeting (POST .../confirm)                                           | 2xx                   | 201                                                                       |
| 21  | Scheduling and email | Confirmed request created a meeting                                              | meeting id            | present                                                                   |
| 22  | Scheduling and email | Confirmation email delivered                                                     | more than one message | 3 messages in total                                                       |
| 23  | Meetings and files   | Meeting detail (GET /api/meetings/:id)                                           | 200                   | 200                                                                       |
| 24  | Meetings and files   | Non-participant cannot open the meeting                                          | 403 or 404            | 403                                                                       |
| 25  | Meetings and files   | Administrator sees the meeting in the meeting list                               | listed                | listed                                                                    |
| 26  | Meetings and files   | Upload a meeting file                                                            | 201                   | 201                                                                       |
| 27  | Meetings and files   | Download through the short-lived link matches the upload                         | same bytes            | same bytes                                                                |
| 28  | Meetings and files   | Stream file content (GET /api/files/:id/content) matches the upload              | same bytes            | same bytes                                                                |
| 29  | Meetings and files   | Non-participant cannot read the file                                             | 403                   | 403                                                                       |
| 30  | Recording workflow   | Recording upload without consent is rejected                                     | 400                   | 400                                                                       |
| 31  | Recording workflow   | Upload a recording with consent                                                  | 2xx                   | 201 (4.2 MB)                                                              |
| 32  | Recording workflow   | Upload alone does not start processing                                           | no transcript         | no transcript                                                             |
| 33  | Recording workflow   | Start processing (POST .../recording/generate)                                   | 2xx                   | 202                                                                       |
| 34  | Recording workflow   | Transcription completes (Whisper small, CPU)                                     | completed             | completed                                                                 |
| 35  | Recording workflow   | Analysis completes and waits for review (Ollama, llama3)                         | ready_for_review      | ready_for_review (see processing times below)                             |
| 36  | Recording workflow   | Status updates arrive over SSE                                                   | events received       | snapshot, status and settled events                                       |
| 37  | Recording workflow   | Analysis returns a summary for review                                            | non-empty summary     | summary of the feeder 7 voltage drop discussion (6 proposed action items) |
| 38  | Recording workflow   | Apply the reviewed analysis to the minutes                                       | 2xx                   | 200                                                                       |

### Processing times

From the AI worker log, for the 3-minute recording: transcription took 105.7 s and analysis took
30.6 s. The analysis time is not a CPU-only figure, because Ollama used the Apple GPU. The script's
own wall-clock time for this step is longer and is not a processing time: the AI worker was restarted
once during the run (see "Findings"), and it picked up the queued job after the restart.

## Coverage Against the Technical Specification

Section 9 of the Technical Specification lists the validation scope. The evidence for each area is:

| Scope                    | Evidence                                                                                                                                                                                                                                                                                  | Not covered                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Functional testing       | Controller and service tests for sign-in, dashboard, meetings, scheduling requests, files, recordings, minutes and action items; client tests for the dashboard, my meetings, action items, recording progress and form validation; the local smoke test runs these flows through the API | No browser end-to-end tests                                                          |
| API testing              | Authentication, authorization (403), validation errors (400), pagination and status transitions                                                                                                                                                                                           | Most routes are tested at controller level; only a few run over HTTP (`app.test.js`) |
| Database testing         | Migrations applied to an empty database; schema constraints and relationships (`meeting-transcript-schema.test.js`, `recording-workflow-schema.test.js` and the controller tests)                                                                                                         | None identified                                                                      |
| File testing             | Upload, download link, content stream, delete, size limit and unauthorized access (`file.test.js`, `upload-middleware.test.js`)                                                                                                                                                           | Object storage is mocked in the automated tests; the smoke test used Silo            |
| Security testing         | Authentication required (401), meeting-scoped permissions, administrator-only actions, rate limiting (429)                                                                                                                                                                                | No penetration testing                                                               |
| Deployment smoke testing | Local API-level smoke test: health checks, sign-in, scheduling with email, files, and the recording workflow with Whisper and Ollama (38 checks)                                                                                                                                          | Not repeated on a deployed host behind Caddy with TLS and systemd                    |

## Validation Not Covered by This Report

- **Browser walkthrough.** The smoke test drove the API directly; the web interface was not
  exercised. The manual steps are in the Deployment Guide, Step 8.
- **Smoke test on a deployed host.** The smoke test ran the API and workers directly on a workstation,
  without Caddy, TLS or systemd. Repeat it on the target host after deployment (Deployment Guide,
  Section 9.9).
- **Load testing.** No load test has been run, and no capacity figure is claimed.

## Changes Since the Previous Report

- Server tests grew from 9 suites and 113 tests to 43 suites and 597 tests.
- Client tests (62) and AI service tests (20) are now reported.
- New tests cover the upload size limit and the file content stream (`GET /api/files/:id/content`).

## Findings and Known Gaps

- **Upload size limit.** A file must be smaller than 50 MB. A file of exactly 50 MB (52,428,800
  bytes) is rejected with HTTP 413, because the upload library stops a file once it reaches the limit.
- **Continuous integration.** CI runs linting, the server tests without a database, the client tests
  and the client build. The database-backed server tests and the AI service tests run only manually.
- **Mocked services.** Redis and object storage are mocked in the automated tests; the local smoke
  test exercised the real services.
- **Database connection loss stops the API and workflow worker.** While the smoke environment was
  being reset, PostgreSQL terminated the open connections ("terminating connection due to
  administrator command"), and both the API and the workflow worker exited. The PostgreSQL connection
  pool (`server/db/postgres.js`) has no `error` handler, so an error on an idle connection ends the
  process. The systemd units restart a failed service (`Restart=on-failure`), but requests fail until
  then. A database restart or a managed-database failover (Deployment Guide, Options 2 and 3) would
  have the same effect.
- **AI worker and a cleared Redis.** Clearing Redis during the reset also removed the AI worker's
  consumer group, and the worker exited. After a restart it recreated the group and processed the job
  that had been queued in the meantime.

## Conclusion

All automated checks passed for commit `b075593`: linting, 597 server tests with PostgreSQL, 62 client
tests, 16 AI service tests (4 skipped without PyTorch) and the client production build. The local
smoke test passed all 38 checks, including a 3-minute recording processed by Whisper and Ollama. A
browser walkthrough and a smoke test on a deployed host remain to be done.
