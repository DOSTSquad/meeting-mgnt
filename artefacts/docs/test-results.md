# Testing Results Report

Date: 2026-10-07

This report records the automated validation of the DOST Meeting Management system for project
handover. It replaces the report of 3 June 2026, which covered 9 server test suites and predates
most of the delivered code.

## Summary

| Area                              | Status                  | Evidence                                                                 |
| --------------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| Linting                           | Passed                  | ESLint reported no errors in the client and server workspaces.           |
| Server tests without a database   | Passed                  | 35 suites and 453 tests passed; 144 database-backed tests were skipped.  |
| Server tests with PostgreSQL      | Passed                  | All 43 suites and 597 tests passed, including the database-backed tests. |
| Client tests                      | Passed                  | 62 tests passed.                                                         |
| AI service tests                  | Passed                  | 16 of 20 tests passed; 4 were skipped because they need PyTorch.         |
| Client production build           | Passed                  | Vite built the production bundle (2,796 modules).                        |
| Functional end-to-end walkthrough | Not run for this report | Manual procedure; see "Validation not covered by this report".           |
| Deployment smoke test             | Not run for this report | Manual procedure; see "Validation not covered by this report".           |

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

## Coverage Against the Technical Specification

Section 9 of the Technical Specification lists the validation scope. The automated evidence for each
area is:

| Scope                    | Automated evidence                                                                                                                                                                                                                 | Not covered                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Functional testing       | Controller and service tests for sign-in, dashboard, meetings, scheduling requests, files, recordings, minutes and action items; client tests for the dashboard, my meetings, action items, recording progress and form validation | No browser end-to-end tests; the manual walkthrough was not recorded for this report |
| API testing              | Authentication, authorization (403), validation errors (400), pagination and status transitions                                                                                                                                    | Most routes are tested at controller level; only a few run over HTTP (`app.test.js`) |
| Database testing         | Migrations applied to an empty database; schema constraints and relationships (`meeting-transcript-schema.test.js`, `recording-workflow-schema.test.js` and the controller tests)                                                  | None identified                                                                      |
| File testing             | Upload, download link, content stream, delete, size limit and unauthorized access (`file.test.js`, `upload-middleware.test.js`)                                                                                                    | Object storage is mocked                                                             |
| Security testing         | Authentication required (401), meeting-scoped permissions, administrator-only actions, rate limiting (429)                                                                                                                         | No penetration testing                                                               |
| Deployment smoke testing | None                                                                                                                                                                                                                               | Manual procedure only (see below)                                                    |

## Validation Not Covered by This Report

- **Functional end-to-end walkthrough.** Sign in, open the dashboard, create and confirm a meeting
  request, upload and download a file, upload a recording, choose Process Recording, and review the
  generated minutes. The steps are in the Deployment Guide, Step 8. They were not repeated for this
  report.
- **Deployment smoke test.** On a deployed host, check `/health/live` and `/health/ready`, sign in,
  and process one recording end to end (Deployment Guide, Section 9.9; `npm run check:workflow`
  automates the recording workflow check). It was not run for this report.
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
- **Mocked services.** Redis and object storage are mocked, so their real behaviour is exercised only
  by the manual workflow check.

## Conclusion

All automated checks passed for commit `b075593`: linting, 597 server tests with PostgreSQL, 62 client
tests, 16 AI service tests (4 skipped without PyTorch) and the client production build. The functional
walkthrough and the deployment smoke test are manual and were not part of this run.
