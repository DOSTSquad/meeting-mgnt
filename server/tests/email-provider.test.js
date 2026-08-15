import { describe, expect, it, jest } from '@jest/globals'

import { createEmailProvider, createResendTransport } from '../services/email-provider.js'

const commonEnv = {
  CLIENT_URL: 'https://meetings.example.com',
  EMAIL_FROM: 'Meeting Management <meetings@example.com>',
}

describe('email provider', () => {
  it('defaults to SMTP and applies bounded connection timeouts', () => {
    const transport = { sendMail: jest.fn() }
    const createSmtpTransport = jest.fn().mockReturnValue(transport)

    const provider = createEmailProvider({
      env: {
        ...commonEnv,
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_SECURE: 'false',
        SMTP_REQUIRE_TLS: 'true',
        SMTP_USER: 'smtp-user',
        SMTP_PASSWORD: 'smtp-password',
      },
      createSmtpTransport,
    })

    expect(provider).toEqual({
      transport,
      from: commonEnv.EMAIL_FROM,
      clientUrl: commonEnv.CLIENT_URL,
    })
    expect(createSmtpTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'smtp-user', pass: 'smtp-password' },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    })
  })

  it('keeps SMTP_FROM as a fallback for existing deployments', () => {
    const transport = { sendMail: jest.fn() }

    const provider = createEmailProvider({
      env: {
        CLIENT_URL: commonEnv.CLIENT_URL,
        SMTP_HOST: 'smtp.example.com',
        SMTP_FROM: commonEnv.EMAIL_FROM,
      },
      createSmtpTransport: jest.fn().mockReturnValue(transport),
    })

    expect(provider.from).toBe(commonEnv.EMAIL_FROM)
  })

  it('sends through the Resend HTTPS API when configured', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: 'email-1' }),
    })

    const { transport } = createEmailProvider({
      env: {
        ...commonEnv,
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 'test-api-key',
      },
      fetchImpl,
    })

    await expect(
      transport.sendMail({
        from: commonEnv.EMAIL_FROM,
        to: 'invitee@example.com',
        subject: 'Meeting invitation',
        text: 'Invitation text',
        html: '<p>Invitation HTML</p>',
      })
    ).resolves.toEqual({ messageId: 'email-1' })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: commonEnv.EMAIL_FROM,
          to: 'invitee@example.com',
          subject: 'Meeting invitation',
          text: 'Invitation text',
          html: '<p>Invitation HTML</p>',
        }),
        signal: expect.any(AbortSignal),
      })
    )
  })

  it('rejects missing Resend configuration without making a request', () => {
    expect(() =>
      createEmailProvider({
        env: {
          ...commonEnv,
          EMAIL_PROVIDER: 'resend',
        },
        fetchImpl: jest.fn(),
      })
    ).toThrow(
      expect.objectContaining({
        message: 'Email service is not configured for resend',
        statusCode: 503,
      })
    )
  })

  it('rejects unsupported providers', () => {
    expect(() =>
      createEmailProvider({
        env: {
          ...commonEnv,
          EMAIL_PROVIDER: 'automatic',
        },
      })
    ).toThrow(
      expect.objectContaining({
        message: 'Unsupported email provider: automatic',
        statusCode: 503,
      })
    )
  })

  it('turns Resend API failures into operational errors', async () => {
    const transport = createResendTransport({
      apiKey: 'test-api-key',
      fetchImpl: jest.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: jest.fn().mockResolvedValue({ message: 'Sender domain is not verified' }),
      }),
    })

    await expect(
      transport.sendMail({
        from: commonEnv.EMAIL_FROM,
        to: 'invitee@example.com',
        subject: 'Meeting invitation',
        text: 'Invitation text',
        html: '<p>Invitation HTML</p>',
      })
    ).rejects.toEqual(
      expect.objectContaining({
        message: 'Resend rejected the email request',
        code: 'RESEND_API_ERROR',
        providerStatusCode: 422,
        statusCode: 502,
      })
    )
  })

  it('aborts a stalled Resend request', async () => {
    const fetchImpl = jest.fn((_url, { signal }) => {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    })
    const transport = createResendTransport({
      apiKey: 'test-api-key',
      fetchImpl,
      timeoutMs: 1,
    })

    await expect(
      transport.sendMail({
        from: commonEnv.EMAIL_FROM,
        to: 'invitee@example.com',
        subject: 'Meeting invitation',
        text: 'Invitation text',
        html: '<p>Invitation HTML</p>',
      })
    ).rejects.toEqual(
      expect.objectContaining({
        message: 'Resend email request timed out',
        code: 'RESEND_TIMEOUT',
        statusCode: 504,
      })
    )
  })
})
