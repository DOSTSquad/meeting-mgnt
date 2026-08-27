import { buildApiUrl } from './apiClient.js'

const INITIAL_RETRY_MS = 1000
const MAX_RETRY_MS = 15000

// A 4xx will not fix itself by reconnecting: the viewer lost access, the meeting
// is gone, or the token expired. Anything else is treated as a dropped
// connection and retried.
const FATAL_STATUSES = new Set([400, 401, 403, 404])

const delay = (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })

const parseFrame = (raw) => {
  const lines = raw.split('\n')
  const eventLine = lines.find((line) => line.startsWith('event:'))
  const data = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .join('\n')

  if (!data) {
    return null
  }

  try {
    return {
      event: eventLine ? eventLine.slice('event:'.length).trim() : 'message',
      data: JSON.parse(data),
    }
  } catch {
    return null
  }
}

/**
 * Reads the workflow event stream for one meeting.
 *
 * Uses `fetch` rather than `EventSource` because the API authenticates with a
 * bearer header and `EventSource` cannot send one. Moving the JWT into the query
 * string would put it in access logs, proxy logs, and browser history, so it
 * stays in the header.
 *
 * The server sends a database snapshot as the first frame of every connection,
 * so a reconnect resynchronises on its own and no missed Pub/Sub message can
 * leave the UI stale.
 *
 * Returns the stop function. Callers must run it on unmount.
 */
export const subscribeToWorkflowEvents = ({
  meetingId,
  token,
  onSnapshot,
  onSettled,
  onError,
} = {}) => {
  const controller = new AbortController()
  const { signal } = controller
  let retryMs = INITIAL_RETRY_MS

  const stop = () => {
    if (!signal.aborted) {
      controller.abort()
    }
  }

  const readStream = async (body) => {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    for (;;) {
      const { done, value } = await reader.read()

      if (done) {
        return false
      }

      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf('\n\n')

      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')

        // Comment frames are heartbeats. They exist to keep proxies from reaping
        // the connection and carry nothing to act on.
        if (raw.startsWith(':')) {
          continue
        }

        const frame = parseFrame(raw)

        if (!frame) {
          continue
        }

        if (frame.event === 'snapshot' || frame.event === 'status') {
          onSnapshot?.(frame.data)
        } else if (frame.event === 'settled') {
          onSettled?.(frame.data)
          return true
        } else if (frame.event === 'error') {
          onError?.(new Error(frame.data?.message || 'Workflow stream ended'))
          return true
        }
      }
    }
  }

  const run = async () => {
    while (!signal.aborted) {
      try {
        const response = await fetch(buildApiUrl(`/api/meetings/${meetingId}/workflow/events`), {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal,
        })

        if (FATAL_STATUSES.has(response.status)) {
          onError?.(new Error(`Workflow stream refused (${response.status})`))
          return
        }

        if (!response.ok || !response.body) {
          throw new Error(`Workflow stream failed (${response.status})`)
        }

        // Only reset the backoff once a connection actually succeeded, so a
        // server that accepts and immediately drops cannot become a hot loop.
        retryMs = INITIAL_RETRY_MS

        if (await readStream(response.body)) {
          return
        }
      } catch (error) {
        if (signal.aborted) {
          return
        }

        onError?.(error)
      }

      if (signal.aborted) {
        return
      }

      await delay(retryMs, signal)
      retryMs = Math.min(retryMs * 2, MAX_RETRY_MS)
    }
  }

  void run()

  return stop
}
