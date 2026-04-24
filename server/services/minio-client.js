import * as Minio from 'minio'

export const BUCKET_FILES = process.env.MINIO_BUCKET_FILES || 'meeting-files'
export const BUCKET_AUDIO = process.env.MINIO_BUCKET_AUDIO || 'meeting-audio'

let _client = null

const getClient = () => {
  if (!_client) {
    _client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: Number(process.env.MINIO_PORT) || 9000,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || '',
      secretKey: process.env.MINIO_SECRET_KEY || '',
    })
  }

  return _client
}

export const putObject = (bucket, key, stream, size, metadata) =>
  getClient().putObject(bucket, key, stream, size, metadata)

export const presignedGetObject = (bucket, key, ttlSeconds) =>
  getClient().presignedGetObject(bucket, key, ttlSeconds)

export const presignedPutObject = (bucket, key, ttlSeconds) =>
  getClient().presignedPutObject(bucket, key, ttlSeconds)

export const statObject = (bucket, key) =>
  getClient().statObject(bucket, key)

export const removeObject = (bucket, key) =>
  getClient().removeObject(bucket, key)
