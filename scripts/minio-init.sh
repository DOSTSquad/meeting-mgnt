#!/bin/sh
set -e

MINIO_BUCKET_AI_RESULTS=${MINIO_BUCKET_AI_RESULTS:-meeting-ai-results}

mc alias set local http://minio:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
mc mb --ignore-existing "local/$MINIO_BUCKET_FILES" "local/$MINIO_BUCKET_AUDIO" "local/$MINIO_BUCKET_AI_RESULTS"

echo "MinIO buckets ready: $MINIO_BUCKET_FILES, $MINIO_BUCKET_AUDIO, $MINIO_BUCKET_AI_RESULTS"
