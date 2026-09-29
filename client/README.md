# Client

Vite + React + Tailwind CSS v3 front-end for DOST Meeting Management. It talks to the Express API under `/api`.

## Run

From the repo root:

| Task            | Command                              |
| --------------- | ------------------------------------ |
| Dev server      | `npm run dev --workspace=client`     |
| Build           | `npm run build --workspace=client`   |
| Lint            | `npm run lint --workspace=client`    |
| Tests           | `npm run test --workspace=client`    |
| Preview a build | `npm run preview --workspace=client` |

Only `VITE_*` variables reach the client. `VITE_API_BASE_URL` sets the API origin; it defaults to `http://localhost:3001` in development and to same-origin `/` in production builds (behind Caddy).

## Layout

- `src/features/` — screens by area: `auth`, `dashboard`, `meetings` (create flow, detail, repository, recording and AI review), `action-items`, `notifications`, `admin`.
- `src/services/` — API calls (axios).
- `src/lib/` — shared helpers, including recording upload helpers.
- `tests/` — tests run with `node --test`.

## Recording upload

The recording pickers accept audio (MP3, WAV, M4A) or video (MP4, MOV, WebM, MKV). For a video, the audio track is copied into an `.m4a` in the browser, in a Web Worker with [`mediabunny`](https://www.npmjs.com/package/mediabunny), and only that file is uploaded. See `src/lib/extractAudio*.js` and `src/lib/recordingFile.js`. The API still accepts audio only, up to 50 MB.
