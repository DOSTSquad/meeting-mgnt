# AGENTS.md

Guidelines for anyone (human or AI) contributing to this repo.

## Stack

- **Monorepo** via npm workspaces (`client`, `server`).
- **Client**: Vite + React (JS, not TS), Tailwind CSS v3, react-router-dom, axios.
- **Server**: Node.js + Express (ESM), dotenv, cors.
- **Infra (local dev)**: docker-compose — PostgreSQL 16, Redis 7, MinIO.
- **Tooling**: ESLint (flat config) + Prettier.

## Layout

```
meeting-mgnt/
├── client/               # React app (Vite)
│   ├── src/
│   └── eslint.config.js
├── server/               # Express API
│   ├── routes/ controllers/ middleware/ models/ services/
│   ├── index.js          # entrypoint
│   └── eslint.config.js
├── scripts/              # one-off shell scripts (e.g. minio-init.sh)
├── docker-compose.yml    # postgres + redis + minio (+ minio-init sidecar)
├── .env.example          # source of truth for env var names
├── .prettierrc.json      # repo-wide format rules
└── package.json          # root workspace manifest + lint/format scripts
```

## First-time setup

```bash
cp .env.example .env          # fill in secrets locally
npm install                   # one install from the root; workspaces handle the rest
docker compose up -d          # postgres, redis, minio, minio-init
```

`minio-init` runs once and exits — it creates the `meeting-files` and `meeting-audio` buckets in MinIO. Idempotent on re-runs.

## Running

| Task | Command |
|---|---|
| Dev client | `npm run dev --workspace=client` |
| Dev server | `npm run dev --workspace=server` |
| Build client | `npm run build --workspace=client` |
| Lint (both workspaces) | `npm run lint` |
| Format check | `npm run format` |
| Format write | `npm run format:fix` |
| Stop infra | `docker compose down` |
| Stop + wipe volumes | `docker compose down -v` |

## Environment variables

All required vars live in `.env.example`. Copy it to `.env` for local dev. The Vite client only sees vars prefixed `VITE_*`. Never commit `.env` — it is gitignored; `.env.example` is the only env file in version control.

## Code conventions

- **ESM everywhere** — both workspaces set `"type": "module"`. Use `import`/`export`, not `require`.
- **Prettier is authoritative for formatting** — don't hand-tune spacing; run `npm run format:fix`. Rules: no semicolons, single quotes, trailing commas `es5`, print width 100.
- **ESLint complains about real bugs, not style.** `eslint-config-prettier` is loaded last in both configs to disable conflicting rules.
- **Keep scope tight.** A ticket to "initialize X" scaffolds X; don't also refactor Y or add Z. Parallel tickets exist on purpose.
- **No comments that restate the code.** Only write a comment when the *why* is non-obvious.
- **No new top-level docs** unless asked. Put work context in PR descriptions, not stray `.md` files.

## Git & PR workflow

### Branches

Use the exact branch name Linear generates for the ticket (copy from the issue sidebar):

```
jhowliu/dos-<NN>-<slugified-title>
```

### Commits

Prefix every commit subject with the ticket ID so Linear auto-links:

```
DOS-33: scaffold monorepo (client/server) and .env.example
```

Use a HEREDOC for multi-line messages; include the co-author trailer at the end:

```
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

Do not amend published commits. If a hook fails, fix the root cause and make a new commit — never `--no-verify`.

### Pull requests

- **Title** starts with the ticket ID: `DOS-NN: <what it does>`.
- **Body** must mention every ticket ID it closes so Linear auto-attaches (multiple allowed when bundling, e.g. DOS-33 + DOS-37 in PR #1).
- Standard sections: `## Summary`, `## Changes`, `## Test plan` (as a checklist).
- Move the ticket to **In Progress** when you start, **In Review** when the PR is up, **Done** on merge (Linear flips automatically once the PR merges if linked correctly).

### Merge-order & lockfile conflicts

Running multiple workspace-scoffolding PRs in parallel means several branches each create/modify root `package-lock.json`. Whichever PR merges first lands clean; the rest will show `CONFLICTING` on the lockfile. The fix is mechanical:

```bash
git fetch origin
git rebase origin/main
# conflict on package-lock.json
git checkout --ours package-lock.json   # take main's lockfile
rm -rf node_modules && npm install      # regenerate with this branch's deps folded in
git add package-lock.json
git rebase --continue
git push --force-with-lease origin HEAD
```

Never force-push without `--with-lease`. Never force-push to `main`.

## Gotchas

- **`gh` auth**: there is a global `GITHUB_TOKEN` env that belongs to a different account. Run `source ~/.zshrc` in the same shell invocation before any `gh` command so the repo-scoped PAT loads first.
- **Compose env substitution**: `docker-compose.yml` references `${MINIO_ACCESS_KEY}`, `${POSTGRES_USER}`, etc. — these come from `.env` (not `.env.example`). Running `docker compose config` without a `.env` file will warn about unset variables; that is not an error.
- **Tailwind v3, not v4**: the config (`tailwind.config.js` + `postcss.config.js` + `@tailwind` directives) assumes v3. v4 has a different setup and is not wired here.
- **`.claude/` is scratch space** (agent worktrees, memory). It is gitignored and `.prettierignore`d — don't touch it and don't rely on it being stable.
