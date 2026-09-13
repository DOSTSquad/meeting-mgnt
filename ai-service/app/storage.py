import io
import json
import os
from pathlib import Path

from minio import Minio


def _client() -> Minio:
    endpoint = os.getenv("MINIO_ENDPOINT", "localhost")
    port = os.getenv("MINIO_PORT", "9000")
    if ":" not in endpoint:
        endpoint = f"{endpoint}:{port}"

    return Minio(
        endpoint,
        secure=os.getenv("MINIO_USE_SSL", "false").lower() == "true",
        access_key=os.getenv("MINIO_ACCESS_KEY", ""),
        secret_key=os.getenv("MINIO_SECRET_KEY", ""),
    )


def _ensure_bucket(client: Minio, bucket: str) -> None:
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)


def download_object(bucket: str, key: str, destination: Path) -> None:
    _client().fget_object(bucket, key, str(destination))


def object_exists(bucket: str, key: str) -> bool:
    try:
        _client().stat_object(bucket, key)
        return True
    except Exception as error:
        if getattr(error, "code", None) in {"NoSuchKey", "NoSuchObject", "NoSuchBucket"}:
            return False
        raise


def read_json(bucket: str, key: str) -> dict:
    response = _client().get_object(bucket, key)
    try:
        return json.loads(response.read().decode("utf-8"))
    finally:
        response.close()
        response.release_conn()


def write_json(bucket: str, key: str, value: dict) -> None:
    client = _client()
    _ensure_bucket(client, bucket)
    data = json.dumps(value, ensure_ascii=False).encode("utf-8")
    client.put_object(
        bucket,
        key,
        io.BytesIO(data),
        length=len(data),
        content_type="application/json",
    )
