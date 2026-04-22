#!/bin/sh
set -e

mc alias set local http://minio:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
mc mb --ignore-existing "local/$MINIO_BUCKET_FILES" "local/$MINIO_BUCKET_AUDIO"

echo "MinIO buckets ready: $MINIO_BUCKET_FILES, $MINIO_BUCKET_AUDIO"
