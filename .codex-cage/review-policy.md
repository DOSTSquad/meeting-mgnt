# Codex Cage Review Policy

These checks supplement the repository guidance in `AGENTS.md` during independent review.

## Blocking Checks

- Behavior changes must include appropriate unit or integration tests.
- API input must be validated at the boundary and operational errors must use centralized error handling.
- Routes must remain thin; business logic belongs in services and database access belongs in models or repositories.
- Protected resources must enforce authentication, authorization, and ownership rules, including failure cases.
- Database schema changes must use a versioned migration and preserve existing data unless data loss is explicitly required.
- API contract changes must update `server/README.md` and `docs/postman/dost-meeting-mgnt.postman_collection.json`.
- Credentials, tokens, private user data, and uploaded content must not be exposed in logs, diffs, or artifacts.
- Client changes must remain usable on desktop and mobile and follow the existing Tailwind design language.

## Verification Expectations

- `npm run lint`
- `npm run build --workspace=client`
- `npm run test:db --workspace=server`
