import { createServer } from 'node:http'
import { Readable } from 'node:stream'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'

const envKeys = [
  'MINIO_ENDPOINT',
  'MINIO_PORT',
  'MINIO_USE_SSL',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_REGION',
]
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))
const requests = []
const bucketResponses = new Map()
const objectBody = Buffer.from('Meeting notes: 會議紀錄')
const lastModified = 'Wed, 14 Oct 2026 00:00:00 GMT'

let server
let storage
let endpoint

const respondWithError = (response, status, code) => {
  response.writeHead(status, { 'content-type': 'application/xml' })
  response.end(`<Error><Code>${code}</Code><Message>${code}</Message></Error>`)
}

beforeAll(async () => {
  // Exercise the real SDK over HTTP; a mocked SDK would miss signing and stream incompatibilities.
  server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    const [, bucket, ...keyParts] = url.pathname.split('/')
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    requests.push({
      method: request.method,
      path: decodeURIComponent(url.pathname),
      headers: request.headers,
      body: Buffer.concat(chunks),
    })

    if (keyParts.join('/') === '') {
      const status = bucketResponses.get(bucket) ?? 200
      if (request.method === 'HEAD') {
        response.writeHead(status)
        response.end()
        return
      }
      if (request.method === 'PUT') {
        if (bucket === 'racing-bucket') {
          respondWithError(response, 409, 'BucketAlreadyOwnedByYou')
          return
        }
        if (bucket === 'failed-create-bucket') {
          respondWithError(response, 403, 'AccessDenied')
          return
        }
        bucketResponses.set(bucket, 200)
        response.writeHead(200)
        response.end()
        return
      }
    }

    if (bucket === 'missing-object-bucket') {
      respondWithError(response, 404, 'NoSuchKey')
      return
    }
    if (request.method === 'DELETE') {
      response.writeHead(204)
      response.end()
      return
    }
    if (request.method === 'PUT') {
      response.writeHead(200, { etag: '"storage-etag"', 'x-amz-version-id': 'version-1' })
      response.end()
      return
    }

    response.writeHead(200, {
      'content-type': 'text/plain',
      'content-length': objectBody.length,
      'last-modified': lastModified,
      etag: '"storage-etag"',
      'x-amz-meta-description': 'notes',
      'x-amz-version-id': 'version-1',
    })
    response.end(request.method === 'HEAD' ? undefined : objectBody)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  endpoint = `http://127.0.0.1:${port}`
  Object.assign(process.env, {
    MINIO_ENDPOINT: '127.0.0.1',
    MINIO_PORT: String(port),
    MINIO_USE_SSL: 'false',
    MINIO_ACCESS_KEY: 'test-access-key',
    MINIO_SECRET_KEY: 'test-secret-key',
    MINIO_REGION: 'ap-southeast-2',
  })
  storage = await import('../services/minio-client.js')
})

beforeEach(() => {
  requests.length = 0
  bucketResponses.clear()
})

afterAll(async () => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  if (server) {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
})

describe('S3-compatible storage client', () => {
  it('uploads the exact file bytes, size, MIME type, and custom metadata using path-style URLs', async () => {
    const result = await storage.putObject(
      'meeting-files',
      'meetings/example/會議.txt',
      objectBody,
      objectBody.length,
      { 'Content-Type': 'text/plain', description: 'notes' }
    )

    const upload = requests.find((request) => request.method === 'PUT')
    expect(upload.path).toBe('/meeting-files/meetings/example/會議.txt')
    expect(upload.body).toEqual(objectBody)
    expect(upload.headers['content-type']).toBe('text/plain')
    expect(upload.headers['content-length']).toBe(String(objectBody.length))
    expect(upload.headers['x-amz-meta-description']).toBe('notes')
    expect(upload.headers.authorization).toContain('/ap-southeast-2/s3/aws4_request')
    expect(result).toEqual({ etag: 'storage-etag', versionId: 'version-1' })
  })

  it('accepts a Node.js upload stream with a known size', async () => {
    await storage.putObject(
      'meeting-audio',
      'recordings/example.mp3',
      Readable.from([objectBody]),
      objectBody.length,
      { 'Content-Type': 'audio/mpeg' }
    )

    expect(requests.find((request) => request.method === 'PUT').body).toEqual(objectBody)
  })

  it('creates a missing bucket in the configured region and caches successful checks', async () => {
    bucketResponses.set('new-bucket', 404)

    await storage.ensureBucketExists('new-bucket')
    await storage.ensureBucketExists('new-bucket')

    expect(requests.map((request) => request.method)).toEqual(['HEAD', 'PUT'])
    expect(requests[1].body.toString()).toContain(
      '<LocationConstraint>ap-southeast-2</LocationConstraint>'
    )
  })

  it('accepts a bucket concurrently created by the same owner', async () => {
    bucketResponses.set('racing-bucket', 404)

    await expect(storage.ensureBucketExists('racing-bucket')).resolves.toBeUndefined()
  })

  it('propagates access-denied bucket checks without attempting creation or caching failure', async () => {
    bucketResponses.set('denied-bucket', 403)

    await expect(storage.ensureBucketExists('denied-bucket')).rejects.toMatchObject({
      $metadata: { httpStatusCode: 403 },
    })
    await expect(storage.ensureBucketExists('denied-bucket')).rejects.toMatchObject({
      $metadata: { httpStatusCode: 403 },
    })
    expect(requests.map((request) => request.method)).toEqual(['HEAD', 'HEAD'])
  })

  it('propagates bucket creation failure', async () => {
    bucketResponses.set('failed-create-bucket', 404)

    await expect(storage.ensureBucketExists('failed-create-bucket')).rejects.toMatchObject({
      name: 'AccessDenied',
    })
  })

  it('signs download URLs with the existing expiry, attachment filename, and MIME type', async () => {
    const disposition =
      'attachment; filename="notes.txt"; filename*=UTF-8\'\'%E6%9C%83%E8%AD%B0.txt'
    const url = new URL(
      await storage.presignedGetObject('meeting-files', 'meetings/example/會議.txt', 60, {
        'response-content-disposition': disposition,
        'response-content-type': 'text/plain',
      })
    )

    expect(url.origin).toBe(endpoint)
    expect(decodeURIComponent(url.pathname)).toBe('/meeting-files/meetings/example/會議.txt')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60')
    expect(url.searchParams.get('X-Amz-Credential')).toContain('/ap-southeast-2/s3/aws4_request')
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/)
    expect(url.searchParams.get('response-content-disposition')).toBe(disposition)
    expect(url.searchParams.get('response-content-type')).toBe('text/plain')
    expect(requests).toHaveLength(0)
  })

  it('signs upload URLs without requiring AWS-specific checksum headers', async () => {
    const url = new URL(await storage.presignedPutObject('meeting-audio', 'recording.mp3', 60))

    expect(url.origin).toBe(endpoint)
    expect(url.pathname).toBe('/meeting-audio/recording.mp3')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60')
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host')
    expect(url.searchParams.has('x-amz-checksum-crc32')).toBe(false)
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/)
  })

  it('returns a readable Node.js download stream for files and AI results', async () => {
    const stream = await storage.getObject('meeting-files', 'meetings/example/notes.txt')
    expect(stream).toBeInstanceOf(Readable)
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)

    expect(Buffer.concat(chunks)).toEqual(objectBody)
  })

  it('preserves the object stat shape', async () => {
    await expect(
      storage.statObject('meeting-files', 'meetings/example/notes.txt')
    ).resolves.toEqual({
      size: objectBody.length,
      lastModified: new Date(lastModified),
      etag: 'storage-etag',
      metaData: { 'content-type': 'text/plain', description: 'notes' },
      versionId: 'version-1',
    })
  })

  it('propagates missing-object errors', async () => {
    await expect(storage.getObject('missing-object-bucket', 'notes.txt')).rejects.toMatchObject({
      name: 'NoSuchKey',
    })
  })

  it('deletes the requested object', async () => {
    await expect(
      storage.removeObject('meeting-files', 'meetings/example/notes.txt')
    ).resolves.toBeUndefined()
    expect(requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'DELETE', path: '/meeting-files/meetings/example/notes.txt' },
    ])
  })
})
