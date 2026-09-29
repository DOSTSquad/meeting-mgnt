import { getWorkflowSnapshot, isWorkflowSettled } from '../services/workflow-events-service.js'
import { getWorkflowStatusSubscriber } from '../services/workflow-status-subscriber.js'

const HEARTBEAT_MS = Number(process.env.WORKFLOW_SSE_HEARTBEAT_MS) || 15000

const writeFrame = (res, event, data) => {
  if (res.writableEnded) {
    return
  }

  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export const streamWorkflowEvents = async (req, res, next) => {
  const { meetingId } = req.params
  const callerId = req.user?.id
  const callerRole = req.user?.role

  let snapshot

  try {
    // Authorise and load before writing anything. Once the 200 and the
    // text/event-stream headers are out, a 403 can no longer be expressed, so a
    // non-participant must be refused here.
    snapshot = await getWorkflowSnapshot(meetingId, callerId, callerRole)
  } catch (error) {
    next(error)
    return
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    // no-transform stops intermediaries rewriting or compressing the body, which
    // would buffer it. X-Accel-Buffering is the nginx opt-out; Caddy honours it
    // through its reverse proxy as well.
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()

  let closed = false
  let unsubscribe
  let heartbeat
  let hasSentSnapshot = false
  let invalidationQueued = false
  let reloading = false

  const close = () => {
    if (closed) {
      return
    }

    closed = true
    clearInterval(heartbeat)
    unsubscribe?.()

    if (!res.writableEnded) {
      res.end()
    }
  }

  // A settled transcript ends the stream for this slice. Checked before
  // subscribing so a client that connects after the work finished gets its
  // snapshot and a clean close rather than an idle connection.
  if (isWorkflowSettled(snapshot)) {
    writeFrame(res, 'snapshot', snapshot)
    writeFrame(res, 'settled', { reason: 'workflow-settled' })
    close()
    return
  }

  // Comment frames keep proxies and load balancers from reaping an idle stream,
  // and give the client a liveness signal between real transitions.
  heartbeat = setInterval(() => {
    if (res.writableEnded) {
      close()
      return
    }

    res.write(': heartbeat\n\n')
  }, HEARTBEAT_MS)
  heartbeat.unref?.()

  // Never forward the Redis payload. It is only a signal that something changed;
  // Pub/Sub can drop or reorder it, so the authoritative state is re-read here.
  const onInvalidation = async () => {
    if (closed || !hasSentSnapshot) {
      invalidationQueued = true
      return
    }

    if (reloading) {
      invalidationQueued = true
      return
    }

    reloading = true

    try {
      do {
        invalidationQueued = false
        const fresh = await getWorkflowSnapshot(meetingId, callerId, callerRole)

        writeFrame(res, 'status', fresh)

        if (isWorkflowSettled(fresh)) {
          writeFrame(res, 'settled', { reason: 'workflow-settled' })
          close()
          return
        }
      } while (invalidationQueued && !closed)
    } catch (error) {
      // Access revoked mid-stream, or the database went away. Either way this
      // viewer must stop receiving updates.
      writeFrame(res, 'error', { message: 'Workflow stream ended' })
      console.error('Workflow stream reload failed', {
        meetingId,
        message: error.message,
      })
      close()
    } finally {
      reloading = false
    }
  }

  try {
    unsubscribe = await getWorkflowStatusSubscriber().subscribe(meetingId, () => {
      void onInvalidation()
    })
  } catch (error) {
    console.error('Workflow stream could not subscribe', { meetingId, message: error.message })
    writeFrame(res, 'snapshot', snapshot)
    writeFrame(res, 'error', { message: 'Workflow stream unavailable' })
    close()
    return
  }

  if (closed) {
    // The client hung up while the subscribe was in flight.
    unsubscribe()
    return
  }

  try {
    // Redis Pub/Sub does not replay. Reloading only after the listener exists
    // closes the gap between authorisation and attaching this stream.
    snapshot = await getWorkflowSnapshot(meetingId, callerId, callerRole)
    writeFrame(res, 'snapshot', snapshot)
    hasSentSnapshot = true

    if (isWorkflowSettled(snapshot)) {
      writeFrame(res, 'settled', { reason: 'workflow-settled' })
      close()
      return
    }

    if (invalidationQueued) {
      void onInvalidation()
    }
  } catch (error) {
    writeFrame(res, 'error', { message: 'Workflow stream ended' })
    console.error('Workflow stream reload failed', {
      meetingId,
      message: error.message,
    })
    close()
    return
  }

  req.on('close', close)
  res.on('close', close)
}
