import nodemailer from 'nodemailer'

const RESEND_EMAIL_URL = 'https://api.resend.com/emails'
const RESEND_TIMEOUT_MS = 10000

const createOperationalError = (message, statusCode, code) => {
  const error = new Error(message)
  error.statusCode = statusCode
  if (code) {
    error.code = code
  }

  return error
}

const isPresent = (value) => Boolean(value && String(value).trim())

export const createResendTransport = ({
  apiKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = RESEND_TIMEOUT_MS,
}) => ({
  sendMail: async ({ from, to, subject, text, html, icalEvent }) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    let response

    try {
      const attachments = icalEvent
        ? [
            {
              filename: icalEvent.filename,
              content: Buffer.from(icalEvent.content).toString('base64'),
              content_type: `text/calendar; charset=utf-8; method=${icalEvent.method}`,
            },
          ]
        : undefined

      response = await fetchImpl(RESEND_EMAIL_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, text, html, attachments }),
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted || error.name === 'AbortError') {
        throw createOperationalError('Resend email request timed out', 504, 'RESEND_TIMEOUT')
      }

      throw createOperationalError('Unable to reach Resend', 502, 'RESEND_CONNECTION_ERROR')
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const error = createOperationalError(
        'Resend rejected the email request',
        502,
        'RESEND_API_ERROR'
      )
      error.providerStatusCode = response.status
      throw error
    }

    const result = await response.json()
    return { messageId: result.id }
  },
})

export const createEmailProvider = ({
  env = process.env,
  fetchImpl = globalThis.fetch,
  createSmtpTransport = nodemailer.createTransport,
} = {}) => {
  const provider = (env.EMAIL_PROVIDER || 'smtp').trim().toLowerCase()
  const clientUrl = env.CLIENT_URL

  if (!['smtp', 'resend'].includes(provider)) {
    throw createOperationalError(`Unsupported email provider: ${provider}`, 503)
  }

  const from = env.EMAIL_FROM || (provider === 'smtp' ? env.SMTP_FROM : undefined)
  if (!isPresent(from) || !isPresent(clientUrl)) {
    throw createOperationalError(`Email service is not configured for ${provider}`, 503)
  }

  if (provider === 'resend') {
    if (!isPresent(env.RESEND_API_KEY)) {
      throw createOperationalError('Email service is not configured for resend', 503)
    }

    return {
      transport: createResendTransport({ apiKey: env.RESEND_API_KEY, fetchImpl }),
      from,
      clientUrl,
    }
  }

  if (!isPresent(env.SMTP_HOST)) {
    throw createOperationalError('Email service is not configured for smtp', 503)
  }

  const user = env.SMTP_USER
  const password = env.SMTP_PASSWORD
  if (isPresent(user) !== isPresent(password)) {
    throw createOperationalError('Email service is not configured for smtp', 503)
  }

  const transport = createSmtpTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT) || 587,
    secure: env.SMTP_SECURE === 'true',
    requireTLS: env.SMTP_REQUIRE_TLS !== 'false',
    auth: isPresent(user) && isPresent(password) ? { user, pass: password } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  })

  return { transport, from, clientUrl }
}
