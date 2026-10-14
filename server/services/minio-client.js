import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const BUCKET_FILES = process.env.MINIO_BUCKET_FILES || 'meeting-files'
export const BUCKET_AUDIO = process.env.MINIO_BUCKET_AUDIO || 'meeting-audio'

let _client = null
const ensuredBuckets = new Set()

const getClient = () => {
  if (!_client) {
    const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http'
    const host = process.env.MINIO_ENDPOINT || 'localhost'
    const port = Number(process.env.MINIO_PORT) || 9000

    _client = new S3Client({
      endpoint: `${protocol}://${host}:${port}`,
      region: process.env.MINIO_REGION || 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY || '',
        secretAccessKey: process.env.MINIO_SECRET_KEY || '',
      },
      // Avoid optional AWS checksum extensions on S3-compatible storage and presigned uploads.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  }

  return _client
}

const isBucketAlreadyExistsError = (error) =>
  ['BucketAlreadyExists', 'BucketAlreadyOwnedByYou'].includes(error?.name)

export const ensureBucketExists = async (bucket) => {
  if (ensuredBuckets.has(bucket)) {
    return
  }

  const client = getClient()
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch (error) {
    if (error.$metadata?.httpStatusCode !== 404) {
      throw error
    }

    try {
      const region = await client.config.region()
      await client.send(
        new CreateBucketCommand({
          Bucket: bucket,
          ...(region !== 'us-east-1' && {
            CreateBucketConfiguration: { LocationConstraint: region },
          }),
        })
      )
    } catch (error) {
      if (!isBucketAlreadyExistsError(error)) {
        throw error
      }
    }
  }

  ensuredBuckets.add(bucket)
}

export const putObject = async (bucket, key, stream, size, metadata) => {
  await ensureBucketExists(bucket)

  const { 'Content-Type': contentType, ...objectMetadata } = metadata ?? {}
  const result = await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: stream,
      ContentLength: size,
      ContentType: contentType,
      Metadata: objectMetadata,
    })
  )

  return { etag: unquoteEtag(result.ETag), versionId: result.VersionId }
}

export const presignedGetObject = (bucket, key, ttlSeconds, reqParams) =>
  getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: reqParams?.['response-content-disposition'],
      ResponseContentType: reqParams?.['response-content-type'],
    }),
    { expiresIn: ttlSeconds }
  )

export const presignedPutObject = (bucket, key, ttlSeconds) =>
  getSignedUrl(getClient(), new PutObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: ttlSeconds,
  })

const unquoteEtag = (etag) => etag?.replace(/^"|"$/g, '')

export const statObject = async (bucket, key) => {
  const result = await getClient().send(new HeadObjectCommand({ Bucket: bucket, Key: key }))

  return {
    size: result.ContentLength,
    lastModified: result.LastModified,
    etag: unquoteEtag(result.ETag),
    metaData: { 'content-type': result.ContentType, ...result.Metadata },
    versionId: result.VersionId,
  }
}

export const getObject = async (bucket, key) => {
  const result = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }))

  return result.Body
}

export const removeObject = async (bucket, key) => {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}
